// @vitest-environment jsdom
/**
 * WebBluetoothAdapter 单测 —— 用 fake navigator.bluetooth 验证 GATT 建链重试。
 *
 * 重点复现真机 bug：HM-10 在 gatt.connect() 后、getPrimaryService() 前瞬断，
 * 抛 "GATT Server is disconnected. Cannot retrieve services."。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { WebBluetoothAdapter } from './WebBluetoothAdapter';

interface FakeParts {
  device: any;
  char: any;
  gatt: any;
  listeners: Record<string, Set<(e: any) => void>>;
  emitNotify: (bytes: number[]) => void;
}

function installFakeBluetooth(opts: {
  failServiceTimes?: number;
  /** requestDevice 抛 NotFoundError（模拟用户取消） */
  cancel?: boolean;
} = {}): FakeParts {
  let serviceCalls = 0;
  const listeners: Record<string, Set<(e: any) => void>> = {};

  const char: any = {
    value: null as DataView | null,
    addEventListener(name: string, cb: (e: any) => void) {
      (listeners[name] ??= new Set()).add(cb);
    },
    removeEventListener(name: string, cb: (e: any) => void) {
      listeners[name]?.delete(cb);
    },
    async startNotifications() {},
    async writeValueWithResponse() {},
    async writeValueWithoutResponse() {},
  };
  const service: any = { async getCharacteristic() { return char; } };
  const gatt: any = {
    connected: false,
    async connect() {
      this.connected = true;
      return this;
    },
    disconnect() {
      this.connected = false;
    },
    async getPrimaryService() {
      serviceCalls++;
      if (serviceCalls <= (opts.failServiceTimes ?? 0)) {
        this.connected = false; // 模拟 HM-10 瞬断
        throw new Error('GATT Server is disconnected. Cannot retrieve services.');
      }
      return service;
    },
  };
  const device: any = {
    name: 'RK6006-FAKE',
    gatt,
    addEventListener() {},
    removeEventListener() {},
  };
  const bluetooth = {
    async requestDevice() {
      if (opts.cancel) {
        const err = new DOMException('cancelled', 'NotFoundError');
        throw err;
      }
      return device;
    },
  };

  Object.defineProperty(navigator, 'bluetooth', {
    value: bluetooth,
    configurable: true,
    writable: true,
  });

  return {
    device,
    char,
    gatt,
    listeners,
    emitNotify(bytes: number[]) {
      char.value = new DataView(new Uint8Array(bytes).buffer);
      for (const cb of listeners['characteristicvaluechanged'] ?? []) {
        cb({ target: char });
      }
    },
  };
}

afterEach(() => {
  // 清理 navigator.bluetooth
  Object.defineProperty(navigator, 'bluetooth', {
    value: undefined,
    configurable: true,
  });
});

describe('WebBluetoothAdapter — GATT 建链重试', () => {
  it('getPrimaryService 瞬断 2 次后重试成功', async () => {
    installFakeBluetooth({ failServiceTimes: 2 });
    const adapter = new WebBluetoothAdapter();
    const name = await adapter.connect();
    expect(name).toBe('RK6006-FAKE');
    expect(adapter.connected).toBe(true);
  }, 15000);

  it('超过最大重试次数后抛错', async () => {
    installFakeBluetooth({ failServiceTimes: 99 });
    const adapter = new WebBluetoothAdapter();
    await expect(adapter.connect()).rejects.toThrow(/GATT Server is disconnected/);
  }, 15000);

  it('无瞬断时一次成功', async () => {
    installFakeBluetooth({ failServiceTimes: 0 });
    const adapter = new WebBluetoothAdapter();
    await adapter.connect();
    expect(adapter.connected).toBe(true);
  }, 10000);
});

describe('WebBluetoothAdapter — 数据与断连', () => {
  it('onData 收到通知字节', async () => {
    const fake = installFakeBluetooth();
    const adapter = new WebBluetoothAdapter();
    await adapter.connect();

    const received: number[][] = [];
    adapter.onData((d) => received.push(Array.from(d)));
    fake.emitNotify([0x01, 0x03, 0x02, 0x00, 0x05]);
    expect(received).toEqual([[0x01, 0x03, 0x02, 0x00, 0x05]]);
  });

  it('write 透传到特征值', async () => {
    installFakeBluetooth();
    const adapter = new WebBluetoothAdapter();
    await adapter.connect();
    await expect(
      adapter.write(Uint8Array.of(0x01, 0x06), true),
    ).resolves.toBeUndefined();
  });

  it('未连接时 connect 抛 BleUnavailableError（无 navigator.bluetooth）', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      value: undefined,
      configurable: true,
    });
    const adapter = new WebBluetoothAdapter();
    await expect(adapter.connect()).rejects.toThrow(/不支持 Web Bluetooth/);
  });
});
