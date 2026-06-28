import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './sessionStore';
import { db } from './db';
import type { Telemetry } from '@/types/device';

function point(t: number, v: number): Telemetry {
  return {
    voltageSetpoint: v,
    currentSetpoint: 1,
    voltageActual: v,
    currentActual: 1,
    powerActual: v,
    temperature: 25,
    outputOn: true,
    timestamp: t,
  };
}

beforeEach(async () => {
  await db.points.clear();
  await db.sessions.clear();
  useSessionStore.setState({ recordingId: null, sessions: [], replay: null });
});

describe('sessionStore — 长会话记录与回放（P1-3）', () => {
  it('startSession → recordPoint → endSession 记录点数并刷新列表', async () => {
    await useSessionStore.getState().startSession('DEV', false);
    const id = useSessionStore.getState().recordingId;
    expect(id).not.toBeNull();
    await useSessionStore.getState().recordPoint(point(1000, 12));
    await useSessionStore.getState().recordPoint(point(2000, 13));
    await useSessionStore.getState().endSession();

    expect(useSessionStore.getState().recordingId).toBeNull();
    const sessions = useSessionStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.pointCount).toBe(2);
    expect(sessions[0]!.endedAt).toBeDefined();
  });

  it('replaySession 载入历史采样点（按时间排序）', async () => {
    await useSessionStore.getState().startSession('DEV', false);
    const id = useSessionStore.getState().recordingId!;
    await useSessionStore.getState().recordPoint(point(2000, 13));
    await useSessionStore.getState().recordPoint(point(1000, 12));
    await useSessionStore.getState().endSession();

    await useSessionStore.getState().replaySession(id);
    const replay = useSessionStore.getState().replay;
    expect(replay).not.toBeNull();
    expect(replay!.points).toHaveLength(2);
    expect(replay!.points[0]!.timestamp).toBe(1000); // 升序
    expect(replay!.points[1]!.voltageActual).toBe(13);
  });

  it('deleteSession 删除会话及其采样点', async () => {
    await useSessionStore.getState().startSession('DEV', false);
    const id = useSessionStore.getState().recordingId!;
    await useSessionStore.getState().recordPoint(point(1000, 12));
    await useSessionStore.getState().endSession();

    await useSessionStore.getState().deleteSession(id);
    expect(useSessionStore.getState().sessions).toHaveLength(0);
    expect(await db.points.where('sessionId').equals(id).count()).toBe(0);
  });

  it('exitReplay 清空回放状态', async () => {
    await useSessionStore.getState().startSession('DEV', false);
    const id = useSessionStore.getState().recordingId!;
    await useSessionStore.getState().recordPoint(point(1000, 12));
    await useSessionStore.getState().endSession();
    await useSessionStore.getState().replaySession(id);
    expect(useSessionStore.getState().replay).not.toBeNull();
    useSessionStore.getState().exitReplay();
    expect(useSessionStore.getState().replay).toBeNull();
  });

  it('clearAll 清空全部会话与点', async () => {
    await useSessionStore.getState().startSession('A', false);
    await useSessionStore.getState().recordPoint(point(1, 1));
    await useSessionStore.getState().endSession();
    await useSessionStore.getState().startSession('B', false);
    await useSessionStore.getState().recordPoint(point(2, 2));
    await useSessionStore.getState().endSession();
    expect(useSessionStore.getState().sessions).toHaveLength(2);

    await useSessionStore.getState().clearAll();
    expect(useSessionStore.getState().sessions).toHaveLength(0);
    expect(await db.sessions.count()).toBe(0);
  });
});
