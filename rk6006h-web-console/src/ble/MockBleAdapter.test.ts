import { describe, expect, it } from 'vitest';
import { MockBleAdapter } from './MockBleAdapter';
import { verifyCrc } from '@/modbus/crc16';
import { buildReadHolding, buildWriteSingle } from '@/modbus/frames';
import { isExceptionFc } from '@/types/modbus';

/** 从 Mock 取下一次 write 的异步通知帧。 */
function nextFrame(mock: MockBleAdapter, req: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve) => {
    mock.onData((d) => resolve(d));
    void mock.write(req, false);
  });
}

describe('MockBleAdapter — 故障注入', () => {
  it('exception 故障：回异常帧（FC|0x80）', async () => {
    const mock = new MockBleAdapter();
    await mock.connect();
    mock.setFault({ type: 'exception' });
    const resp = await nextFrame(mock, buildReadHolding(0x0004, 1));
    expect(isExceptionFc(resp[1]!)).toBe(true);
    expect(verifyCrc(resp)).toBe(true); // 异常帧本身 CRC 仍正确
  });

  it('crc 故障：响应 CRC 被破坏', async () => {
    const mock = new MockBleAdapter();
    await mock.connect();
    mock.setFault({ type: 'crc' });
    const resp = await nextFrame(mock, buildWriteSingle(0x0008, 1000));
    expect(verifyCrc(resp)).toBe(false);
  });

  it('silent 故障：不交付任何通知', async () => {
    const mock = new MockBleAdapter();
    await mock.connect();
    mock.setFault({ type: 'silent' });
    const delivered = await Promise.race([
      nextFrame(mock, buildReadHolding(0x0004, 1)).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 60)),
    ]);
    expect(delivered).toBe(false);
  });

  it('清除故障后恢复正常响应', async () => {
    const mock = new MockBleAdapter();
    await mock.connect();
    mock.setFault({ type: 'exception' });
    await nextFrame(mock, buildReadHolding(0x0004, 1));
    mock.setFault({ type: 'none' });
    const resp = await nextFrame(mock, buildReadHolding(0x0004, 1));
    expect(isExceptionFc(resp[1]!)).toBe(false);
    expect(verifyCrc(resp)).toBe(true);
  });
});
