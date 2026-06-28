/**
 * 会话历史 Store（Zustand）—— 配合 IndexedDB（db.ts）实现长会话记录与回放。
 *
 * 生命周期：deviceStore 连接时 startSession → 每次 pollOnce 成功 recordPoint →
 * 断开时 endSession。回放时把历史点载入 replay，TrendChart 据此渲染（冻结）。
 */

import { create } from 'zustand';
import { db, type PointRow, type SessionRow } from './db';
import type { Telemetry } from '@/types/device';

interface ReplayState {
  session: SessionRow;
  points: Telemetry[];
}

interface SessionState {
  /** 正在记录的会话 id（null 表示未在记录） */
  recordingId: number | null;
  /** 历史会话列表（按开始时间倒序） */
  sessions: SessionRow[];
  /** 当前回放的历史会话 + 采样点（null 表示实时模式） */
  replay: ReplayState | null;
  loading: boolean;

  startSession: (deviceName: string, isMock: boolean) => Promise<void>;
  recordPoint: (t: Telemetry) => Promise<void>;
  endSession: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  replaySession: (id: number) => Promise<void>;
  exitReplay: () => void;
  deleteSession: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  recordingId: null,
  sessions: [],
  replay: null,
  loading: false,

  startSession: async (deviceName, isMock) => {
    try {
      const id = await db.sessions.add({
        startedAt: Date.now(),
        deviceName,
        isMock,
        pointCount: 0,
      });
      set({ recordingId: id as number });
    } catch {
      // DB 不可用时降级：不记录，不影响连接
    }
  },

  recordPoint: async (t) => {
    const sid = get().recordingId;
    if (sid == null) return;
    try {
      await db.points.add({
        sessionId: sid,
        t: t.timestamp,
        vSet: t.voltageSetpoint,
        iSet: t.currentSetpoint,
        vAct: t.voltageActual,
        iAct: t.currentActual,
        pwr: t.powerActual,
        temp: t.temperature,
        on: t.outputOn ? 1 : 0,
      });
    } catch {
      // 单点写入失败不致命
    }
  },

  endSession: async () => {
    const sid = get().recordingId;
    set({ recordingId: null });
    if (sid == null) return;
    try {
      const count = await db.points.where('sessionId').equals(sid).count();
      await db.sessions.update(sid, { endedAt: Date.now(), pointCount: count });
      await get().refreshSessions();
    } catch {
      // 忽略
    }
  },

  refreshSessions: async () => {
    set({ loading: true });
    try {
      const sessions = await db.sessions.orderBy('startedAt').reverse().toArray();
      set({ sessions });
    } catch {
      // 忽略
    } finally {
      set({ loading: false });
    }
  },

  replaySession: async (id) => {
    try {
      const session = await db.sessions.get(id);
      if (!session) return;
      const rows = await db.points
        .where('[sessionId+t]')
        .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
        .toArray();
      set({ replay: { session, points: rows.map(toTelemetry) } });
    } catch {
      // 忽略
    }
  },

  exitReplay: () => set({ replay: null }),

  deleteSession: async (id) => {
    try {
      await db.points.where('sessionId').equals(id).delete();
      await db.sessions.delete(id);
    } catch {
      // 忽略
    }
    if (get().replay?.session.id === id) set({ replay: null });
    await get().refreshSessions();
  },

  clearAll: async () => {
    try {
      await db.points.clear();
      await db.sessions.clear();
    } catch {
      // 忽略
    }
    set({ sessions: [], replay: null });
  },
}));

function toTelemetry(r: PointRow): Telemetry {
  return {
    voltageSetpoint: r.vSet,
    currentSetpoint: r.iSet,
    voltageActual: r.vAct,
    currentActual: r.iAct,
    powerActual: r.pwr,
    temperature: r.temp,
    outputOn: r.on !== 0,
    timestamp: r.t,
  };
}
