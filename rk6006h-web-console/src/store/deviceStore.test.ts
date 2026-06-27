import { afterEach, describe, expect, it } from 'vitest';
import { useDeviceStore } from './deviceStore';

const store = () => useDeviceStore.getState();

afterEach(async () => {
  if (store().status !== 'disconnected') {
    await store().disconnect();
  }
  useDeviceStore.setState({ log: [], error: null });
});

describe('deviceStore — Mock 端到端', () => {
  it('连接后状态为 connected 且遥测已填充', async () => {
    await store().connect({ mock: true });

    expect(store().status).toBe('connected');
    expect(store().deviceName).toBe('RK6006-MOCK');
    expect(store().info?.firmwareRaw).toBe(0x0231);

    const t = store().telemetry;
    expect(t).not.toBeNull();
    expect(t!.outputOn).toBe(true);
    // Mock 初值：12.00 V（/100）、2.000 A（/1000）
    expect(t!.voltageSetpoint).toBeCloseTo(12.0, 2);
    expect(t!.currentSetpoint).toBeCloseTo(2.0, 3);
  });

  it('保护设置已读取', async () => {
    await store().connect({ mock: true });
    const p = store().protection;
    expect(p).not.toBeNull();
    expect(p!.ovp.threshold).toBe(0x001c);
    expect(p!.ocp.raw).toBe(0x4029);
  });

  it('setOutput(false) 关闭输出并刷新', async () => {
    await store().connect({ mock: true });
    expect(store().telemetry?.outputOn).toBe(true);

    await store().setOutput(false);
    expect(store().telemetry?.outputOn).toBe(false);
  });

  it('报文日志记录了 tx/rx', async () => {
    await store().connect({ mock: true });
    const log = store().log;
    expect(log.some((e) => e.direction === 'tx')).toBe(true);
    expect(log.some((e) => e.direction === 'rx' && e.crcOk)).toBe(true);
  });

  it('disconnect 后状态清空', async () => {
    await store().connect({ mock: true });
    await store().disconnect();
    expect(store().status).toBe('disconnected');
    expect(store().telemetry).toBeNull();
    expect(store().deviceName).toBeNull();
  });

  it('setVoltage 写入后设定值更新（V×100）', async () => {
    await store().connect({ mock: true });
    await store().setVoltage(24); // 24 × 100 = 2400
    expect(store().telemetry?.voltageSetpoint).toBeCloseTo(24.0, 2);
  });

  it('setCurrent 写入后设定值更新（I×1000）', async () => {
    await store().connect({ mock: true });
    await store().setCurrent(3); // 3 × 1000 = 3000
    expect(store().telemetry?.currentSetpoint).toBeCloseTo(3.0, 3);
  });

  it('applyPresets 写入 3 组预设（FC10）', async () => {
    await store().connect({ mock: true });
    await store().applyPresets([
      { voltage: 5, current: 1 },
      { voltage: 12, current: 2 },
      { voltage: 24, current: 3 },
    ]);
    const hasFc10 = store().log.some(
      (e) => e.direction === 'tx' && e.bytes[1] === 0x10,
    );
    expect(hasFc10).toBe(true);
  });

  it('历史缓冲随轮询增长', async () => {
    await store().connect({ mock: true });
    const len0 = store().history.length;
    await store().pollOnce();
    expect(store().history.length).toBe(len0 + 1);
  });

  it('attemptReconnect 重连成功后恢复 connected', async () => {
    await store().connect({ mock: true });
    useDeviceStore.setState({ status: 'connecting' });
    await store().attemptReconnect();
    expect(store().status).toBe('connected');
    expect(store().telemetry).not.toBeNull();
  });
});
