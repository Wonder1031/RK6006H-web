import { afterEach, describe, expect, it } from 'vitest';
import { useDeviceStore } from './deviceStore';
import { ExceptionCode } from '@/types/modbus';
import { REG } from '@/registers/map';

const store = () => useDeviceStore.getState();

afterEach(async () => {
  if (store().status !== 'disconnected') {
    store().injectFault({ type: 'none' });
    await store().disconnect();
  }
  useDeviceStore.setState({
    log: [],
    error: null,
    pollFailures: 0,
    lastException: null,
    activeAlert: null,
  });
});

describe('deviceStore — Mock 端到端', () => {
  it('连接后状态为 connected 且遥测已填充', async () => {
    await store().connect({ mock: true });

    expect(store().status).toBe('connected');
    expect(store().deviceName).toBe('RK6006-MOCK');
    expect(store().info?.firmwareRaw).toBe(0x0072); // 固件 114 → V1.14
    expect(store().info?.serialRaw).toBe(561); // 序列号 00000561

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

  it('clearHistory 清空实时历史缓冲', async () => {
    await store().connect({ mock: true });
    expect(store().history.length).toBeGreaterThan(0);
    store().clearHistory();
    expect(store().history).toHaveLength(0);
  });

  it('attemptReconnect 重连成功后恢复 connected', async () => {
    await store().connect({ mock: true });
    useDeviceStore.setState({ status: 'connecting' });
    await store().attemptReconnect();
    expect(store().status).toBe('connected');
    expect(store().telemetry).not.toBeNull();
  });
});

describe('deviceStore — 通信故障反馈（P0-1/2/9）', () => {
  it('写入收到异常帧时设置 error 并含异常说明', async () => {
    await store().connect({ mock: true });
    store().injectFault({ type: 'exception', code: ExceptionCode.IllegalDataValue });
    await store().setVoltage(10);
    expect(store().error).toContain('电压设定失败');
    expect(store().error).toContain('非法数据值');
  });

  it('输出切换异常帧时设置 error', async () => {
    await store().connect({ mock: true });
    store().injectFault({ type: 'exception', code: ExceptionCode.SlaveDeviceBusy });
    await store().setOutput(false);
    expect(store().error).toContain('输出切换失败');
    expect(store().error).toContain('从机忙');
  });

  it('写入 CRC 错误时设置 error（传输层 reject）', async () => {
    await store().connect({ mock: true });
    store().injectFault({ type: 'crc' });
    await store().setCurrent(2);
    expect(store().error).toContain('电流设定失败');
    // 设定值未变（CRC 错时写命令应被拒）
    expect(store().telemetry?.currentSetpoint).toBeCloseTo(2.0, 3);
  });

  it('正常写入成功后清空 error', async () => {
    await store().connect({ mock: true });
    store().injectFault({ type: 'exception' });
    await store().setVoltage(10); // 失败
    expect(store().error).not.toBeNull();
    store().injectFault({ type: 'none' });
    await store().setVoltage(20); // 成功
    expect(store().error).toBeNull();
    expect(store().telemetry?.voltageSetpoint).toBeCloseTo(20.0, 2);
  });

  it('轮询异常帧记录 lastException 并累计 pollFailures', async () => {
    await store().connect({ mock: true });
    expect(store().pollFailures).toBe(0);
    store().injectFault({ type: 'exception', code: ExceptionCode.IllegalDataAddress });
    await store().pollOnce();
    expect(store().pollFailures).toBe(1);
    expect(store().lastException).toBe('非法地址');
  });

  it('轮询 CRC 错误累计 pollFailures，恢复后归零', async () => {
    await store().connect({ mock: true });
    store().injectFault({ type: 'crc' });
    await store().pollOnce();
    await store().pollOnce();
    await store().pollOnce();
    expect(store().pollFailures).toBe(3);
    store().injectFault({ type: 'none' });
    await store().pollOnce();
    expect(store().pollFailures).toBe(0);
    expect(store().lastException).toBeNull();
  });
});

describe('deviceStore — 告警：输出异常断开检测（P1-5）', () => {
  it('设备侧自行关输出（非用户操作）→ 触发 activeAlert', async () => {
    await store().connect({ mock: true });
    await store().pollOnce(); // 建立前一帧：outputOn=true
    expect(store().telemetry?.outputOn).toBe(true);
    expect(store().activeAlert).toBeNull();

    // 模拟设备侧关输出（如保护触发），不经 setOutput → outputIntent 仍为 null
    store().setMockRegister(REG.OUTPUT_ON, 0);
    await store().pollOnce();

    expect(store().telemetry?.outputOn).toBe(false);
    expect(store().activeAlert).not.toBeNull();
    expect(store().activeAlert?.title).toContain('输出异常断开');
  });

  it('用户主动关输出（setOutput）不触发告警', async () => {
    await store().connect({ mock: true });
    await store().pollOnce();
    expect(store().telemetry?.outputOn).toBe(true);

    await store().setOutput(false); // 用户主动关
    expect(store().telemetry?.outputOn).toBe(false);
    expect(store().activeAlert).toBeNull();
  });

  it('dismissAlert 清空告警', async () => {
    await store().connect({ mock: true });
    await store().pollOnce();
    store().setMockRegister(REG.OUTPUT_ON, 0);
    await store().pollOnce();
    expect(store().activeAlert).not.toBeNull();
    store().dismissAlert();
    expect(store().activeAlert).toBeNull();
  });

  it('setSound 切换并持久化', () => {
    store().setSound(true);
    expect(store().soundEnabled).toBe(true);
    store().setSound(false);
    expect(store().soundEnabled).toBe(false);
  });
});
