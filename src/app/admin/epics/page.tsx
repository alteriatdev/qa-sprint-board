// src/app/admin/epics/page.tsx
"use client";
import { useEffect, useState, useCallback } from "react";

interface EpicRow {
  id: number; jiraKey: string; team: string; title: string | null;
  jiraStatus: string | null; firstPass: number; retestPct: number;
  critbusiness: boolean; task: boolean; goalDone: boolean;
  goal: string | null; priority: string;
}

interface SprintData { sprint: { id: number; number: number }; epics: EpicRow[] }

export default function AdminEpics() {
  const [data, setData] = useState<SprintData | null>(null);
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/sprint/active");
    const d = await res.json();
    setData(d);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateEpic(id: number, patch: Record<string, unknown>) {
    setSaving((s) => ({ ...s, [id]: true }));
    await fetch(`/api/epics/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, updatedBy: "admin" }),
    });
    setSaving((s) => ({ ...s, [id]: false }));
    await load();
  }

  if (!data) return <p className="text-gray-400">Загрузка...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Эпики — Спринт {data.sprint.number}</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800 text-left">
              <th className="py-2 pr-4">Ключ</th>
              <th className="py-2 pr-4">Название</th>
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Статус Jira</th>
              <th className="py-2 pr-4 text-center">Чек-лист %</th>
              <th className="py-2 pr-4 text-center">Ретесты %</th>
              <th className="py-2 pr-4 text-center">Критбизнес</th>
              <th className="py-2 pr-4 text-center">Цель ✓</th>
            </tr>
          </thead>
          <tbody>
            {data.epics.map((epic) => (
              <tr key={epic.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 pr-4">
                  <a
                    href={`https://sprutgaming.atlassian.net/browse/${epic.jiraKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline"
                  >
                    {epic.jiraKey}
                  </a>
                </td>
                <td className="py-2 pr-4 max-w-xs truncate text-gray-200">
                  {epic.title ?? <span className="text-gray-600 italic">не синкнуто</span>}
                </td>
                <td className="py-2 pr-4 text-gray-400">{epic.team}</td>
                <td className="py-2 pr-4 text-gray-400">{epic.jiraStatus ?? "—"}</td>
                <td className="py-2 pr-4 text-center">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={epic.firstPass}
                    onBlur={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value)));
                      if (val !== epic.firstPass) updateEpic(epic.id, { firstPass: val });
                    }}
                    className="w-16 bg-gray-800 text-white text-center rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </td>
                <td className="py-2 pr-4 text-center text-gray-400">{epic.retestPct}%</td>
                {(["critbusiness", "goalDone"] as const).map((flag) => (
                  <td key={flag} className="py-2 pr-4 text-center">
                    <input
                      type="checkbox"
                      defaultChecked={epic[flag]}
                      onChange={(e) => updateEpic(epic.id, { [flag]: e.target.checked })}
                      className="accent-indigo-500 w-4 h-4"
                    />
                  </td>
                ))}
                {saving[epic.id] && (
                  <td className="py-2 text-indigo-400 text-xs">Сохр...</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
