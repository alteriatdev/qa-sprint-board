// src/components/BoardDataProvider.tsx
// Загружает данные из /api/sprint/active.
// Если API недоступен (нет DB_URL и т.п.) — использует статический sprint.ts как fallback.
"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Epic, Member, Assignment, Sprint } from "@/data/sprint";
import {
  epics as staticEpics,
  members as staticMembers,
  assignments as staticAssignments,
  sprint as staticSprint,
} from "@/data/sprint";

export interface BoardData {
  sprint: Sprint;
  epics: Epic[];
  members: Member[];
  assignments: Assignment[];
  syncedAt: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const BoardDataContext = createContext<BoardData | null>(null);

function apiEpicToEpic(e: Record<string, unknown>): Epic {
  return {
    key: e.jiraKey as string,
    title: (e.title as string) ?? (e.jiraKey as string),
    goal: (e.goal as string) ?? "",
    priority: (e.priority as Epic["priority"]) ?? "none",
    team: e.team as Epic["team"],
    jiraStatus: (e.jiraStatus as Epic["jiraStatus"]) ?? "backlog",
    progress: {
      firstPass: (e.firstPass as number) ?? 0,
      retest: (e.retestPct as number) ?? undefined,
    },
    critbusiness: (e.critbusiness as boolean) ?? false,
    task: (e.task as boolean) ?? false,
    goalDone: (e.goalDone as boolean) ?? false,
    firstPassEnabled: (e.firstPassEnabled as boolean) ?? true,
    retestEnabled: (e.retestEnabled as boolean) ?? true,
    smokesEnabled: (e.smokesEnabled as boolean) ?? true,
    firstPassDone: (e.firstPassDone as boolean) ?? false,
    retestDone: (e.retestDone as boolean) ?? false,
    smokesDone: (e.smokesDone as boolean) ?? false,
    links: { jira: `https://sprutgaming.atlassian.net/browse/${e.jiraKey}` },
  };
}

function apiMemberToMember(m: Record<string, unknown>): Member {
  return {
    id: m.id as string,
    name: m.name as string,
    slackId: (m.slackId as string) ?? "",
    team: m.team as Member["team"],
    role: m.role as string | undefined,
    shift: m.shift as string | undefined,
  };
}

export function BoardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BoardData>({
    sprint: staticSprint,
    epics: staticEpics,
    members: staticMembers,
    assignments: staticAssignments,
    syncedAt: null,
    loading: true,
    error: null,
    refetch: async () => {},
  });

  // Загрузка агрегата доски. Используется при маунте и при ручном синке
  // (кнопка «Обновить»). Не сбрасывает данные в loading — обновляет «по месту».
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sprint/active");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const d = await res.json();

      // Группируем assignments: memberId → { epicKeys[], note }
      // note хранится по строкам (member, epic); берём первую непустую заметку участника.
      const asgMap = new Map<string, { epicKeys: string[]; note?: string }>();
      for (const a of d.assignments) {
        const key = a.memberId as string;
        if (!asgMap.has(key)) asgMap.set(key, { epicKeys: [] });
        const entry = asgMap.get(key)!;
        entry.epicKeys.push(a.jiraKey as string);
        if (!entry.note && a.note) entry.note = a.note as string;
      }
      const assignments: Assignment[] = Array.from(asgMap.entries()).map(
        ([memberId, { epicKeys, note }]) => ({ memberId, epicKeys, note })
      );

      setData((prev) => ({
        ...prev,
        sprint: {
          number: d.sprint.number,
          start: d.sprint.start,
          endInclusive: d.sprint.end,
          confluenceUrl: d.sprint.confluenceUrl,
        },
        epics: (d.epics as Record<string, unknown>[]).map(apiEpicToEpic),
        members: (d.members as Record<string, unknown>[]).map(apiMemberToMember),
        assignments,
        syncedAt: d.syncedAt,
        loading: false,
        error: null,
      }));
    } catch (err: unknown) {
      console.warn("API недоступен, используем sprint.ts:", err);
      setData((prev) => ({ ...prev, loading: false, error: String(err) }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <BoardDataContext.Provider value={{ ...data, refetch: load }}>
      {children}
    </BoardDataContext.Provider>
  );
}

export function useBoardData(): BoardData {
  const ctx = useContext(BoardDataContext);
  if (!ctx) throw new Error("useBoardData must be used inside BoardDataProvider");
  return ctx;
}
