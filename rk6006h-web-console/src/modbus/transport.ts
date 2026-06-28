/**
 * Modbus 传输层 —— 串行请求队列 + BLE 通知重组 + 超时。
 *
 * 设计要点（见 WebConsole_Implementation_Plan.md §8）：
 *  - 写与通知共用同一特征值 ffe1、无帧分隔 → 请求必须串行：发一帧等响应再发下一帧。
 *  - BLE 通知可能分片 → 接收缓冲区累积，用 expectedFrameLength 判定完整帧。
 *  - 超时守护避免队列卡死。
 */

import { MODBUS_TIMEOUT_MS } from "@/config/constants";
import type { BleAdapter } from "@/ble/BleAdapter";
import { verifyCrc } from "./crc16";
import { buildReadHolding, expectedFrameLength, parseResponse } from "./frames";
import type { FrameLogEntry, ParsedResponse } from "@/types/modbus";

/** 报文日志回调（由 Store 注入，用于 Console 面板）。transport 负责分配 id。 */
export type FrameLogger = (entry: FrameLogEntry) => void;

/** 传输层错误 */
export class ModbusTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModbusTransportError";
  }
}

/** 请求选项（request / readHolding 共用）。 */
export interface RequestOptions {
  /** 超时（ms），缺省取构造时的 defaultTimeout。 */
  timeoutMs?: number;
  /**
   * 是否容忍 CRC 校验失败。默认 **false**：CRC 校验失败即 reject
   * （契约收紧 —— 调用方不再需要每次手判 crcOk）。
   * 设 true 时按"尽力解析"返回 crcOk=false 的响应，仅诊断场景使用。
   */
  allowCrcFail?: boolean;
}

interface Pending {
  resolve: (frame: Uint8Array) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ModbusTransport {
  /** 串行链：每个请求等上一个完成（resolve 或 reject）后再执行。 */
  private chain: Promise<unknown> = Promise.resolve();
  /** 当前请求的接收缓冲（字节流） */
  private rxBuffer: number[] = [];
  /** 当前待决请求 */
  private pending: Pending | null = null;
  /** 当前帧期望总长（收到 byteCount 后确定） */
  private expectedLen: number | null = null;
  /** 通知订阅取消函数 */
  private unsubscribe?: () => void;
  private logId = 0;

  constructor(
    private readonly adapter: BleAdapter,
    private readonly logger?: FrameLogger,
    private readonly defaultTimeout = MODBUS_TIMEOUT_MS,
  ) {}

  /** 订阅 BLE 通知。须在 connect 之后、request 之前调用。 */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.adapter.onData((data) => this.handleNotify(data));
  }

  /** 停止订阅并清理待决请求（拒绝在途请求，避免串行链死锁）。 */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const reject = this.pending.reject;
      this.pending = null;
      this.expectedLen = null;
      reject(new ModbusTransportError("传输已停止"));
    }
    this.expectedLen = null;
  }

  /**
   * 发送请求并等待解析后的响应。
   * 多次调用自动串行排队。
   *
   * 契约：默认对 CRC 校验失败的响应 reject（ModbusTransportError）；
   * 需要诊断原始坏帧时传 `{ allowCrcFail: true }` 获取 crcOk=false 的结果。
   */
  request(req: Uint8Array, opts: RequestOptions = {}): Promise<ParsedResponse> {
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeout;
    const allowCrcFail = opts.allowCrcFail ?? false;
    const run = (): Promise<ParsedResponse> =>
      this.exchange(req, timeoutMs, allowCrcFail);
    // .then(run, run) 保证上一请求无论成功/失败都继续执行本请求
    this.chain = this.chain.then(run, run);
    return this.chain as Promise<ParsedResponse>;
  }

  /** 便捷：读保持寄存器并解析。opts 透传给 request。 */
  readHolding(
    addr: number,
    qty: number,
    opts?: RequestOptions,
  ): Promise<ParsedResponse> {
    return this.request(buildReadHolding(addr, qty), opts);
  }

  /** 是否有请求正在处理。 */
  get busy(): boolean {
    return this.pending !== null;
  }

  // ─── 内部 ───────────────────────────────────────────────────

  private exchange(
    req: Uint8Array,
    timeoutMs: number,
    allowCrcFail: boolean,
  ): Promise<ParsedResponse> {
    return new Promise<ParsedResponse>((resolve, reject) => {
      this.rxBuffer = [];
      this.expectedLen = null;
      const timer = setTimeout(
        () => this.fail(new ModbusTransportError(`请求超时 (${timeoutMs}ms)`)),
        timeoutMs,
      );
      // 注意：pending.resolve 持有「帧级」回调；解析在 settleParsed 中完成。
      this.pending = {
        resolve: (frame) =>
          this.settleParsed(frame, resolve, reject, allowCrcFail),
        reject,
        timer,
      };
      this.log({ direction: "tx", bytes: req, timestamp: Date.now() });
      // HM-10 透传模块用 writeWithoutResponse 更可靠：writeValueWithResponse 在
      // Chrome + HM-10 组合下常卡死或报 "GATT operation already in progress"。
      // Modbus 响应通过 notify 确认，不依赖 write 的链路层 ACK。
      this.adapter.write(req, false).catch((e) => this.fail(e));
    });
  }

  /** 帧已收齐 → 记日志 → CRC 契约 → 解析 → settle。 */
  private settleParsed(
    frame: Uint8Array,
    resolve: (p: ParsedResponse) => void,
    reject: (e: unknown) => void,
    allowCrcFail: boolean,
  ): void {
    const crcOk = verifyCrc(frame);
    this.log({
      direction: "rx",
      bytes: frame,
      timestamp: Date.now(),
      crcOk,
    });
    // 契约：CRC 失败默认 reject（坏帧不可信）。allowCrcFail 为诊断逃生口。
    if (!crcOk && !allowCrcFail) {
      reject(new ModbusTransportError("CRC 校验失败：响应帧损坏"));
      return;
    }
    try {
      resolve(parseResponse(frame));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private handleNotify(data: Uint8Array): void {
    for (const b of data) this.rxBuffer.push(b);
    if (!this.pending) return; // 无待决请求：丢弃多余通知

    const buf = Uint8Array.from(this.rxBuffer);
    if (this.expectedLen === null) {
      this.expectedLen = expectedFrameLength(buf);
    }
    if (this.expectedLen === null || buf.length < this.expectedLen) return; // 尚未收齐

    const frame = buf.slice(0, this.expectedLen);
    // 保留溢出字节（理论上少见，作为下一帧残余处理）
    this.rxBuffer = Array.from(buf.slice(this.expectedLen));

    const resolve = this.pending.resolve;
    this.clearPending();
    resolve(frame);
  }

  private fail(err: unknown): void {
    if (!this.pending) return;
    const reject = this.pending.reject;
    this.clearPending();
    reject(err);
  }

  private clearPending(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending = null;
    }
    this.expectedLen = null;
  }

  private log(partial: Omit<FrameLogEntry, "id">): void {
    this.logger?.({ ...partial, id: this.logId++ });
  }
}
