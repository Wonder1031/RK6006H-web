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
import { MockBleAdapter } from "@/ble/MockBleAdapter";
import { WebBluetoothAdapter } from "@/ble/WebBluetoothAdapter";
import type { BleAdapter } from "@/ble/BleAdapter";
import { buildWriteMultiple, buildWriteSingle } from "@/modbus/frames";
import { ModbusTransport, type FrameLogger } from "@/modbus/transport";
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
import type { FrameLogEntry } from "@/types/modbus";
import { loadSetting, SettingKey } from "@/utils/storage";

export type ConnStatus = "disconnected" | "connecting" | "connected" | "error";

interface DeviceState {
  status: ConnStatus;
  error: string | null;
  deviceName: string | null;
  isMock: boolean;
  info: DeviceInfo | null;
  telemetry: Telemetry | null;
  protection: Protection | null;
  log: FrameLogEntry[];
  history: Telemetry[];

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
}

// ─── 模块级会话对象（不参与响应式渲染）──────────────────────────
let adapter: BleAdapter | null = null;
let transport: ModbusTransport | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let frameSeq = 0;
let manualDisconnect = false;
const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1000;

const pushLog: FrameLogger = (entry) => {
  useDeviceStore.getState().appendLog(entry);
};

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
  error: null,
  deviceName: null,
  isMock: false,
  info: null,
  telemetry: null,
  protection: null,
  log: [],
  history: [],

  appendLog: (entry) =>
    set((s) => {
      const log =
        s.log.length >= FRAME_LOG_MAX ? s.log.slice(1) : s.log.slice();
      return { log: [...log, { ...entry, id: frameSeq++ }] };
    }),

  connect: async (opts) => {
    if (get().status === "connecting" || get().status === "connected") return;
    manualDisconnect = false;
    set({ status: "connecting", error: null });
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

      // GATT 已连接。后续数据读取为「增强」，任何失败都不阻断连接——
      // 首帧不稳定时降级进入 connected，轮询会持续重试补齐数据。
      const warnings: string[] = [];

      // 1) 系统信息（型号 / 固件）—— 降级容错
      let info: DeviceInfo | null = null;
      try {
        const infoResp = await transport.readHolding(0x0000, 4);
        if (infoResp.kind === "read" && infoResp.crcOk) {
          info = decodeDeviceInfo(infoResp.registers);
        } else {
          warnings.push("系统信息响应异常");
        }
      } catch {
        warnings.push("系统信息读取超时");
      }

      // 2) 保护设置 —— 降级容错（不阻断连接）
      try {
        await get().refreshProtection();
      } catch {
        warnings.push("保护设置读取失败");
      }

      // 3) 首次遥测 —— 已有内部容错
      await get().pollOnce();

      set({
        status: "connected",
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
    stopPolling();
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
      deviceName: null,
      info: null,
      telemetry: null,
      protection: null,
      history: [],
      error: null,
    });
  },

  pollOnce: async () => {
    if (!transport) return;
    try {
      const resp = await transport.readHolding(
        POLL_START_ADDRESS,
        POLL_REGISTER_COUNT,
      );
      if (resp.kind === "read" && resp.crcOk) {
        const telemetry = decodeTelemetry(resp.registers);
        set((s) => ({
          telemetry,
          history:
            s.history.length >= HISTORY_MAX
              ? [...s.history.slice(1), telemetry]
              : [...s.history, telemetry],
        }));
      }
    } catch {
      // 单次轮询失败不致命；断连由 onDisconnect 处理
    }
  },

  setOutput: async (on) => {
    if (!transport) return;
    const op = outputOnOff(on);
    await transport.request(buildWriteSingle(op.address, op.value));
    await get().pollOnce();
  },

  setVoltage: async (volts) => {
    if (!transport) return;
    await transport.request(
      buildWriteSingle(REG.V_SETPOINT, encodeVoltageSetpoint(volts)),
    );
    await get().pollOnce();
  },

  setCurrent: async (amps) => {
    if (!transport) return;
    await transport.request(
      buildWriteSingle(REG.I_SETPOINT, encodeCurrentSetpoint(amps)),
    );
    await get().pollOnce();
  },

  applyPresets: async (presets) => {
    if (!transport) return;
    const values = encodePresets(presets);
    await transport.request(buildWriteMultiple(REG.PRESET_BASE, values));
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
    if (resp.kind === "read" && resp.crcOk) {
      set({ protection: decodeProtection(resp.registers) });
    }
  },

  clearError: () => set({ error: null }),
  clearLog: () => set({ log: [] }),
}));
