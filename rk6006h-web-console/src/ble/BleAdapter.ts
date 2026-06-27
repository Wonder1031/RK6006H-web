/**
 * BLE 适配器抽象接口。
 *
 * 将底层蓝牙访问（Web Bluetooth / WebSocket 桥接）与协议层解耦。
 * 上层（ModbusTransport / Store）只依赖此接口，便于替换实现与单测。
 */

/** 连接选项 */
export interface ConnectOptions {
  /** 设备名前缀过滤（默认 "RK6006"） */
  namePrefix?: string;
}

/** 设备未找到 / 不可用错误 */
export class BleUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BleUnavailableError';
  }
}

/** 用户取消设备选择 */
export class BleUserCancelledError extends Error {
  constructor() {
    super('用户取消了设备选择');
    this.name = 'BleUserCancelledError';
  }
}

export interface BleAdapter {
  /** 触发设备选择（需在用户手势中调用）并连接 GATT。返回设备名。 */
  connect(options?: ConnectOptions): Promise<string>;

  /**
   * 写数据到透传特征值 ffe1。
   * @param withResponse true=writeValueWithResponse，false=writeValueWithoutResponse
   */
  write(data: Uint8Array, withResponse: boolean): Promise<void>;

  /** 订阅 ffe1 通知；返回取消订阅函数。支持多订阅者。 */
  onData(cb: (data: Uint8Array) => void): () => void;

  /** 订阅断连事件；返回取消订阅函数。支持多订阅者。 */
  onDisconnect(cb: () => void): () => void;

  /** 当前是否处于已连接状态。 */
  readonly connected: boolean;

  /**
   * 尝试重连（不重新弹出设备选择）。用于意外断连后的自动恢复。
   * @returns 是否重连成功
   */
  reconnect?(): Promise<boolean>;

  /** 主动断开连接。 */
  disconnect(): Promise<void>;
}
