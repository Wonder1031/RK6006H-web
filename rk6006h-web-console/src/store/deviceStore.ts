/**
 * 设备状态 Store（Zustand）。
 *
 * 统一管理连接生命周期、遥测、保护设置、报文日志。
 * 持有 BleAdapter / ModbusTransport 实例（存于模块级变量，不进入响应式 state）。
 */

import { create } from "zustand";
import {
  FRAME_LOG_MAX,
  HISTORY_MAX,
  MODBUS_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  POLL_REGISTER_COUNT,
  POLL_START_ADDRESS,
} from "@/config/constants";
import { MockBleAdapter, type MockFault } from "@/ble/MockBleAdapter";
import { WebBluetoothAdapter } from "@/ble/WebBluetoothAdapter";
import type { BleAdapter } from "@/ble/BleAdapter";
import { buildWriteMultiple, buildWriteSingle } from "@/modbus/frames";
import { ModbusTransport, type FrameLogger } from "@/modbus/transport";
import { describeException } from "@/modbus/exceptions";
import {
  decodeProtection,
  decodeTelemetry,
  decodeDeviceInfo,
} from "@/registers/decode";
import {
  encodeCurrentSetpoint,
  encodePresets,
  encodeVoltageSetpoint,
  outputOnOff,
} from "@/registers/encode";
import { PROTECTION_READ, REG } from "@/registers/map";
import type { DeviceInfo, Preset, Protection, Telemetry } from "@/types/device";
import type { FrameLogEntry, ParsedResponse } from "@/types/modbus";
import { loadSetting, SettingKey } from "@/utils/storage";
import { isSoundEnabled, setSoundEnabled, triggerAlert } from "@/utils/alerts";
import { useSessionStore } from "@/store/sessionStore";

/** 活跃告警（UI 顶部 toast / 闪烁） */
export interface ActiveAlert {
  title: string;
  body?: string;
  /** 触发时刻（ms） */
  at: number;
}

export type ConnStatus = "disconnected" | "connecting" | "connected" | "error";

/** 连接过程中的步骤（P1-8：替代单一「连接中…」）。 */
export type ConnectStep = null | "link" | "info" | "protection" | "live";

interface DeviceState {
  status: ConnStatus;
  /** 连接过程中的当前步骤（仅 status==='connecting' 有意义）。 */
  connectStep: ConnectStep;
  error: string | null;
  deviceName: string | null;
  isMock: boolean;
  info: DeviceInfo | null;
  telemetry: Telemetry | null;
  protection: Protection | null;
  log: FrameLogEntry[];
  history: Telemetry[];
  /** 连续轮询失败次数（成功一次即归零）。用于"通信不稳定"判定。 */
  pollFailures: number;
  /** 最近一次轮询收到的设备异常说明（如「非法地址」）；成功后清空。 */
  lastException: string | null;
  /** 活跃告警（如检测到输出异常断开）；null 表示无。 */
  activeAlert: ActiveAlert | null;
  /** 告警声音是否开启（持久化）。 */
  soundEnabled: boolean;

  connect: (opts?: { mock?: boolean }) => Promise<void>;
  disconnect: () => Promise<void>;
  pollOnce: () => Promise<void>;
  setOutput: (on: boolean) => Promise<void>;
  setVoltage: (volts: number) => Promise<void>;
  setCurrent: (amps: number) => Promise<void>;
  applyPresets: (presets: Preset[]) => Promise<void>;
  /** 意外断连后的自动重连（指数退避，最多 RECONNECT_MAX_ATTEMPTS 次）。 */
  attemptReconnect: () => Promise<void>;
  refreshProtection: () => Promise<void>;
  clearError: () => void;
  clearLog: () => void;
  /** 清空实时趋势历史缓冲（不影响已落库的会话记录）。 */
  clearHistory: () => void;
  /** 关闭当前活跃告警 toast。 */
  dismissAlert: () => void;
  /** 开关告警声音（持久化）。 */
  setSound: (on: boolean) => void;
  /** 仅 Mock 模式：注入 / 清除通信故障（离线演示与测试）。真机模式为空操作。 */
  injectFault: (fault: MockFault) => void;
  /** 仅 Mock 模式：直接改写设备寄存器（模拟设备侧状态变化，如保护触发）。 */
  setMockRegister: (addr: number, value: number) => void;
}

// ─── 模块级会话对象（不参与响应式渲染）──────────────────────────
let adapter: BleAdapter | null = null;
let transport: ModbusTransport | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let frameSeq = 0;
let manualDisconnect = false;
/** 最近一次用户主动设定的输出目标（true=开 / false=关）；轮询据此区分「用户关输出」与「设备异常断开（疑似保护触发）」。 */
let outputIntent: boolean | null = null;
const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1000;

const pushLog: FrameLogger = (entry) => {
  useDeviceStore.getState().appendLog(entry);
};

/**
 * 校验写响应：异常帧 / CRC 失败时抛出可读错误。
 * CRC 默认由传输层在 request 中已 reject（P0-3），此处作防御兜底。
 */
function assertWriteOk(resp: ParsedResponse): void {
  if (resp.kind === "exception") {
    throw new Error(`设备返回 ${describeException(resp.exception)}`);
  }
  if (!resp.crcOk) {
    throw new Error("响应 CRC 校验失败");
  }
}

/** 从任意错误对象取可读消息。 */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(get: () => DeviceStoreInternal): void {
  stopPolling();
  pollTimer = setInterval(() => {
    void get().pollOnce();
  }, POLL_INTERVAL_MS);
}

interface DeviceStoreInternal extends DeviceState {
  appendLog: (e: FrameLogEntry) => void;
}

export const useDeviceStore = create<DeviceStoreInternal>((set, get) => ({
  status: "disconnected",
  connectStep: null,
  error: null,
  deviceName: null,
  isMock: false,
  info: null,
  telemetry: null,
  protection: null,
  log: [],
  history: [],
  pollFailures: 0,
  lastException: null,
  activeAlert: null,
  soundEnabled: isSoundEnabled(),

  appendLog: (entry) =>
    set((s) => {
      const log =
        s.log.length >= FRAME_LOG_MAX ? s.log.slice(1) : s.log.slice();
      return { log: [...log, { ...entry, id: frameSeq++ }] };
    }),

  connect: async (opts) => {
    if (get().status === "connecting" || get().status === "connected") return;
    manualDisconnect = false;
    set({ status: "connecting", connectStep: "link", error: null });
    const useMock = opts?.mock ?? loadSetting<boolean>(SettingKey.mock, false);

    try {
      adapter = useMock ? new MockBleAdapter() : new WebBluetoothAdapter();
      const name = await adapter.connect();

      // 意外断连（非用户主动）→ 自动重连；用户主动断开 → 仅置位
      adapter.onDisconnect(() => {
        stopPolling();
        if (manualDisconnect) {
          set({ status: "disconnected", deviceName: null, error: null });
          return;
        }
        set({ status: "connecting", error: "连接断开，尝试自动重连…" });
        void get().attemptReconnect();
      });

      transport = new ModbusTransport(adapter, pushLog, MODBUS_TIMEOUT_MS);
      transport.start();

      // HM-10 链路稳定窗口：GATT 连接刚建立时首帧易丢失/损坏
      await delay(300);

      // 开启会话记录（IndexedDB 长历史）；刷新历史列表
      await useSessionStore.getState().startSession(name, useMock);
      void useSessionStore.getState().refreshSessions();

      // GATT 已连接。后续数据读取为「增强」，任何失败都不阻断连接——
      // 首帧不稳定时降级进入 connected，轮询会持续重试补齐数据。
      const warnings: string[] = [];

      // 1) 系统信息（型号 / 固件）—— 降级容错
      // CRC 失败由传输层 reject；异常帧在此识别为 warning。
      set({ connectStep: "info" });
      let info: DeviceInfo | null = null;
      try {
        const infoResp = await transport.readHolding(0x0000, 4);
        if (infoResp.kind === "read") {
          info = decodeDeviceInfo(infoResp.registers);
        } else if (infoResp.kind === "exception") {
          warnings.push(`系统信息异常：${describeException(infoResp.exception)}`);
        } else {
          warnings.push("系统信息响应类型异常");
        }
      } catch (e) {
        warnings.push(`系统信息读取失败：${errorMessage(e)}`);
      }

      // 2) 保护设置 —— 降级容错（不阻断连接）。异常帧 → refreshProtection 抛友好错误。
      set({ connectStep: "protection" });
      try {
        await get().refreshProtection();
      } catch (e) {
        warnings.push(`保护设置读取失败：${errorMessage(e)}`);
      }

      // 3) 首次遥测 —— 已有内部容错
      set({ connectStep: "live" });
      await get().pollOnce();

      set({
        status: "connected",
        connectStep: null,
        deviceName: name,
        isMock: useMock,
        info,
        error:
          warnings.length > 0
            ? `已连接（部分初始化数据读取失败：${warnings.join("、")}，将持续重试）`
            : null,
      });
      startPolling(get);
    } catch (e) {
      stopPolling();
      set({
        status: "error",
        connectStep: null,
        error: e instanceof Error ? e.message : String(e),
      });
      if (transport) {
        transport.stop();
        transport = null;
      }
      if (adapter) {
        void adapter.disconnect();
        adapter = null;
      }
    }
  },

  disconnect: async () => {
    manualDisconnect = true;
    outputIntent = null;
    stopPolling();
    // 结束会话记录并刷新历史
    await useSessionStore.getState().endSession();
    if (transport) {
      transport.stop();
      transport = null;
    }
    if (adapter) {
      await adapter.disconnect();
      adapter = null;
    }
    set({
      status: "disconnected",
      connectStep: null,
      deviceName: null,
      info: null,
      telemetry: null,
      protection: null,
      history: [],
      error: null,
      pollFailures: 0,
      lastException: null,
      activeAlert: null,
    });
  },

  pollOnce: async () => {
    if (!transport) return;
    try {
      const resp = await transport.readHolding(
        POLL_START_ADDRESS,
        POLL_REGISTER_COUNT,
      );
      // CRC 失败已在传输层 reject（P0-3）；此处只需处理异常帧。
      if (resp.kind === "exception") {
        set((s) => ({
          pollFailures: s.pollFailures + 1,
          lastException: describeException(resp.exception),
        }));
        return;
      }
      // 读请求不应回写响应；防御性地计为失败。
      if (resp.kind !== "read") {
        set((s) => ({ pollFailures: s.pollFailures + 1 }));
        return;
      }
      const telemetry = decodeTelemetry(resp.registers);
      const prev = get().telemetry;
      // 输出异常断开检测：上一帧为开、本帧为关，且不是用户刚主动关的 → 疑似保护触发
      const prevOn = prev?.outputOn ?? false;
      const tripDetected =
        prevOn && !telemetry.outputOn && outputIntent !== false;
      const expectedUserOff = outputIntent === false;
      outputIntent = null; // 消费意图（已反映到遥测）
      set((s) => ({
        telemetry,
        history:
          s.history.length >= HISTORY_MAX
            ? [...s.history.slice(1), telemetry]
            : [...s.history, telemetry],
        pollFailures: 0,
        lastException: null,
        activeAlert:
          tripDetected && !expectedUserOff
            ? {
                title: "⚠ 输出异常断开",
                body: "检测到非用户操作的输出关闭，可能触发保护（OVP/OCP/OAH 等）",
                at: Date.now(),
              }
            : s.activeAlert,
      }));
      if (tripDetected && !expectedUserOff) {
        triggerAlert("RK6006H 输出异常断开", "可能触发保护，请检查 OVP/OCP 设置");
      }
      // 落库（长会话历史）；fire-and-forget，不阻塞轮询
      void useSessionStore.getState().recordPoint(telemetry);
    } catch {
      // 超时 / 传输错误：累计失败计数，断连由 onDisconnect 兜底。
      set((s) => ({ pollFailures: s.pollFailures + 1 }));
    }
  },

  setOutput: async (on) => {
    if (!transport) return;
    const op = outputOnOff(on);
    outputIntent = on; // 标记用户意图，供 pollOnce 区分用户关输出与异常断开
    try {
      assertWriteOk(await transport.request(buildWriteSingle(op.address, op.value)));
      await get().pollOnce();
      set({ error: null });
    } catch (e) {
      outputIntent = null;
      set({ error: `输出切换失败：${errorMessage(e)}` });
    }
  },

  setVoltage: async (volts) => {
    if (!transport) return;
    try {
      assertWriteOk(
        await transport.request(
          buildWriteSingle(REG.V_SETPOINT, encodeVoltageSetpoint(volts)),
        ),
      );
      await get().pollOnce();
      set({ error: null });
    } catch (e) {
      set({ error: `电压设定失败：${errorMessage(e)}` });
    }
  },

  setCurrent: async (amps) => {
    if (!transport) return;
    try {
      assertWriteOk(
        await transport.request(
          buildWriteSingle(REG.I_SETPOINT, encodeCurrentSetpoint(amps)),
        ),
      );
      await get().pollOnce();
      set({ error: null });
    } catch (e) {
      set({ error: `电流设定失败：${errorMessage(e)}` });
    }
  },

  applyPresets: async (presets) => {
    if (!transport) return;
    try {
      const values = encodePresets(presets);
      assertWriteOk(await transport.request(buildWriteMultiple(REG.PRESET_BASE, values)));
      set({ error: null });
    } catch (e) {
      set({ error: `预设组写入失败：${errorMessage(e)}` });
    }
  },

  attemptReconnect: async () => {
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
      if (manualDisconnect || !adapter) return;
      await delay(RECONNECT_BASE_MS * 2 ** (attempt - 1));
      if (manualDisconnect || !adapter) return;
      const ok = await (adapter.reconnect?.() ?? Promise.resolve(false));
      if (!ok) continue;
      transport?.stop();
      transport?.start();
      try {
        await get().refreshProtection();
        await get().pollOnce();
        set({ status: "connected", error: null });
        startPolling(get);
        return;
      } catch {
        // 本次重连后通信失败，继续下一次尝试
      }
    }
    set({ status: "error", error: "自动重连失败，请手动重新连接" });
  },

  refreshProtection: async () => {
    if (!transport) return;
    const resp = await transport.readHolding(
      PROTECTION_READ.start,
      PROTECTION_READ.count,
    );
    if (resp.kind === "exception") {
      throw new Error(`设备返回 ${describeException(resp.exception)}`);
    }
    if (resp.kind === "read") {
      set({ protection: decodeProtection(resp.registers) });
    }
  },

  clearError: () => set({ error: null }),
  clearLog: () => set({ log: [] }),
  clearHistory: () => set({ history: [] }),
  dismissAlert: () => set({ activeAlert: null }),
  setSound: (on) => {
    setSoundEnabled(on);
    set({ soundEnabled: on });
  },
  injectFault: (fault) => {
    if (adapter instanceof MockBleAdapter) adapter.setFault(fault);
  },
  setMockRegister: (addr, value) => {
    if (adapter instanceof MockBleAdapter) adapter.setRegister(addr, value);
  },
}));
