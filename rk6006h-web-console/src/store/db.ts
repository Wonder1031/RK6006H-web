/**
 * IndexedDB 持久层（Dexie）—— 长会话历史（升级方案 P1-3）。
 *
 * 每次连接开一个 session，轮询遥测点全部落库，支持曲线回放与跨会话查看。
 * points 用复合索引 [sessionId+t] 便于按会话 + 时间区间高效读取。
 */

import Dexie, { type Table } from 'dexie';

export interface SessionRow {
  id?: number;
  /** 开始时间（ms） */
  startedAt: number;
  /** 结束时间（ms） */
  endedAt?: number;
  deviceName: string;
  isMock: boolean;
  /** 采样点数 */
  pointCount: number;
}

/** 单个遥测采样点（紧凑存储，sessionId 关联会话）。 */
export interface PointRow {
  id?: number;
  sessionId: number;
  /** 时间戳（ms） */
  t: number;
  vSet: number;
  iSet: number;
  vAct: number;
  iAct: number;
  pwr: number;
  temp: number;
  /** 输出开关 0/1 */
  on: number;
}

class RKDatabase extends Dexie {
  sessions!: Table<SessionRow, number>;
  points!: Table<PointRow, number>;

  constructor() {
    super('rk6006h');
    this.version(1).stores({
      sessions: '++id, startedAt, deviceName',
      points: '++id, [sessionId+t], sessionId',
    });
  }
}

export const db = new RKDatabase();
