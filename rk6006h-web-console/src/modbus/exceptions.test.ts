import { describe, expect, it } from 'vitest';
import { describeException } from './exceptions';
import { ExceptionCode } from '@/types/modbus';

describe('describeException', () => {
  it('已知异常码翻译为中文', () => {
    expect(describeException(ExceptionCode.IllegalDataAddress)).toBe('非法地址');
    expect(describeException(ExceptionCode.SlaveDeviceBusy)).toBe('从机忙');
    expect(describeException(ExceptionCode.IllegalDataValue)).toBe('非法数据值');
  });

  it('未知异常码返回带十六进制的占位说明', () => {
    expect(describeException(0x7f)).toBe('异常码 0x7f');
  });
});
