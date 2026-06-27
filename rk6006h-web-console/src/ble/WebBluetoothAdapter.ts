/**
 * Web Bluetooth 适配器实现。
 *
 * 将 navigator.bluetooth 封装为 BleAdapter，对接 HM-10 透传 UART（ffe0/ffe1）。
 *
 * 注意：
 *  - requestDevice 必须在用户手势（按钮点击）中调用。
 *  - 仅 Chromium 内核浏览器支持；需 HTTPS 或 localhost（127.0.0.1 属安全上下文）。
 *  - HM-10 模块在 gatt.connect() 后、服务发现前偶发瞬断，抛
 *    "GATT Server is disconnected. Cannot retrieve services." —— connect() 内置重试。
 */

import {
  BLE_CHAR_UUID,
  BLE_SERVICE_UUID,
  DEVICE_NAME_PREFIX,
} from '@/config/constants';
import {
  type BleAdapter,
  BleUnavailableError,
  BleUserCancelledError,
  type ConnectOptions,
} from './BleAdapter';

/** GATT 建链 + 服务发现 + 通知订阅 的最大尝试次数 */
const CONNECT_MAX_ATTEMPTS = 4;
/** 重试退避基数（ms），第 n 次等待 BASE * n */
const CONNECT_BACKOFF_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class WebBluetoothAdapter implements BleAdapter {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private char: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyHandler?: (event: Event) => void;
  private disconnectHandler?: () => void;

  private readonly dataCbs = new Set<(data: Uint8Array) => void>();
  private readonly disconnectCbs = new Set<() => void>();

  get connected(): boolean {
    return this.server?.connected ?? false;
  }

  async connect(options: ConnectOptions = {}): Promise<string> {
    if (!('bluetooth' in navigator) || !navigator.bluetooth) {
      throw new BleUnavailableError(
        '当前浏览器不支持 Web Bluetooth，请使用 Chrome / Edge（HTTPS 或 localhost）。',
      );
    }

    const prefix = options.namePrefix ?? DEVICE_NAME_PREFIX;

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: prefix }],
        optionalServices: [BLE_SERVICE_UUID],
      });
    } catch (e: unknown) {
      // 用户取消选择
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        throw new BleUserCancelledError();
      }
      throw e;
    }
    this.device = device;

    // GATT 建链 + 服务发现 + 通知订阅，带重试
    // （HM-10 在 connect 后、getPrimaryService 前常瞬断）
    let lastErr: unknown;
    for (let attempt = 1; attempt <= CONNECT_MAX_ATTEMPTS; attempt++) {
      try {
        this.server = await device.gatt!.connect();
        const service = await this.server.getPrimaryService(BLE_SERVICE_UUID);
        this.char = await service.getCharacteristic(BLE_CHAR_UUID);

        // 通知处理函数（仅创建一次，重试时复用）
        if (!this.notifyHandler) {
          this.notifyHandler = (event: Event): void => {
            const target = event.target as BluetoothRemoteGATTCharacteristic | null;
            const dv = target?.value;
            if (!dv) return;
            const bytes = new Uint8Array(dv.byteLength);
            bytes.set(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
            for (const cb of this.dataCbs) cb(bytes);
          };
        }
        this.char.addEventListener('characteristicvaluechanged', this.notifyHandler);
        await this.char.startNotifications();

        // 仅在完全建链成功后才注册断连监听（避免重试期间误触发）
        if (!this.disconnectHandler) {
          this.disconnectHandler = (): void => {
            for (const cb of this.disconnectCbs) cb();
          };
          device.addEventListener('gattserverdisconnected', this.disconnectHandler);
        }
        return device.name ?? prefix;
      } catch (e) {
        lastErr = e;
        // 清理本次半成品，下一轮重 connect
        this.char = null;
        this.server = null;
        if (attempt < CONNECT_MAX_ATTEMPTS) {
          await delay(CONNECT_BACKOFF_MS * attempt);
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(String(lastErr ?? 'GATT 连接失败'));
  }

  async write(data: Uint8Array, withResponse: boolean): Promise<void> {
    if (!this.char) throw new BleUnavailableError('未连接：特征值不可用');
    // 复制到独立 ArrayBuffer，规避视图偏移与 TS 的 SharedArrayBuffer 类型收紧
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    if (withResponse) {
      await this.char.writeValueWithResponse(buffer);
    } else {
      await this.char.writeValueWithoutResponse(buffer);
    }
  }

  onData(cb: (data: Uint8Array) => void): () => void {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectCbs.add(cb);
    return () => this.disconnectCbs.delete(cb);
  }

  async disconnect(): Promise<void> {
    this.char?.removeEventListener('characteristicvaluechanged', this.notifyHandler!);
    this.device?.removeEventListener('gattserverdisconnected', this.disconnectHandler!);
    this.notifyHandler = undefined;
    this.disconnectHandler = undefined;
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.char = null;
    this.server = null;
    this.device = null;
  }

  /**
   * 意外断连后重连：复用已持有的 device 引用，重新建立 GATT 与通知订阅。
   * 无需再次 requestDevice（也就不需要用户手势）。复用 connect 的重试逻辑。
   */
  async reconnect(): Promise<boolean> {
    if (!this.device?.gatt) return false;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= CONNECT_MAX_ATTEMPTS; attempt++) {
      try {
        this.server = await this.device.gatt.connect();
        const service = await this.server.getPrimaryService(BLE_SERVICE_UUID);
        this.char = await service.getCharacteristic(BLE_CHAR_UUID);
        if (this.notifyHandler) {
          this.char.addEventListener('characteristicvaluechanged', this.notifyHandler);
        }
        await this.char.startNotifications();
        return true;
      } catch (e) {
        lastErr = e;
        this.char = null;
        this.server = null;
        if (attempt < CONNECT_MAX_ATTEMPTS) {
          await delay(CONNECT_BACKOFF_MS * attempt);
        }
      }
    }
    void lastErr;
    return false;
  }
}
