/**
 * Modbus RTU 协议类型定义。
 *
 * 依据：RK6006H_Bluetooth_Protocol_Analysis.md §4
 */

/** Modbus 功能码（RK6006H 仅使用 3 种） */
export enum FunctionCode {
  ReadHoldingRegisters = 0x03,
  WriteSingleRegister = 0x06,
  WriteMultipleRegisters = 0x10,
}

/** Modbus 异常码（规范定义的常用子集） */
export enum ExceptionCode {
  IllegalFunction = 0x01,
  IllegalDataAddress = 0x02,
  IllegalDataValue = 0x03,
  SlaveDeviceFailure = 0x04,
  Acknowledge = 0x05,
  SlaveDeviceBusy = 0x06,
  MemoryParityError = 0x08,
  GatewayPathUnavailable = 0x0a,
  GatewayNoResponse = 0x0b,
}

/** 判断功能码字节是否为异常响应（最高位被置 1） */
export function isExceptionFc(fc: number): boolean {
  return (fc & 0x80) !== 0;
}

/** 16 位寄存器值（无符号） */
export type RegisterValue = number;

/** 解析后的响应（判别联合） */
export type ParsedResponse =
  | {
      kind: 'read';
      functionCode: FunctionCode.ReadHoldingRegisters;
      /** 寄存器值数组，大端顺序（高字在前） */
      registers: RegisterValue[];
      crcOk: boolean;
    }
  | {
      kind: 'writeSingle';
      functionCode: FunctionCode.WriteSingleRegister;
      address: number;
      value: RegisterValue;
      crcOk: boolean;
    }
  | {
      kind: 'writeMultiple';
      functionCode: FunctionCode.WriteMultipleRegisters;
      address: number;
      quantity: number;
      crcOk: boolean;
    }
  | {
      kind: 'exception';
      /** 原始功能码（已置最高位） */
      functionCode: number;
      exception: ExceptionCode;
      crcOk: boolean;
    };

/** 报文日志条目（用于 Console 面板） */
export interface FrameLogEntry {
  /** 单调自增序号 */
  id: number;
  /** 收发方向 */
  direction: 'tx' | 'rx';
  /** 原始字节（十六进制显示用） */
  bytes: Uint8Array;
  /** 时间戳（ms，epoch） */
  timestamp: number;
  /** CRC 校验结果（仅 rx 有意义） */
  crcOk?: boolean;
  /** 关联说明（如"主状态轮询"） */
  note?: string;
}
