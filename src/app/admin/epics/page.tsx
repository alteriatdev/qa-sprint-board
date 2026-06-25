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
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [localFirstPass, setLocalFirstPass] = useState<Record<number, number>>({});
  const [addKey, setAddKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sprint/active");
    const d = await res.json() as SprintData;
    setData(d);
    // Синхронизируем локальный стейт с данными из БД
    setLocalFirstPass(
      Object.fromEntries(d.epics.map((e: EpicRow) => [e.id, e.firstPass]))
    );
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateEpic(id: number, patch: Record<string, unknown>) {
    setSaving((s) => ({ ...s, [id]: true }));
    setErrors((e) => { const next = { ...e }; delete next[id]; return next; });

    try {
      const res = await fetch(`/api/epics/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, updatedBy: "admin" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        const msg = body.error ?? `Ошибка ${res.status}`;
        setErrors((e) => ({ ...e, [id]: msg }));
        // Откатываем localFirstPass обратно к значению в БД
        if (patch.firstPass !== undefined && data) {
          const epic = data.epics.find((e) => e.id === id);
          if (epic) setLocalFirstPass((s) => ({ ...s, [id]: epic.firstPass }));
        }
        return;
      }

      await load();
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: "Сеть недоступна" }));
      if (patch.firstPass !== undefined && data) {
        const epic = data.epics.find((e) => e.id === id);
        if (epic) setLocalFirstPass((s) => ({ ...s, [id]: epic.firstPass }));
      }
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  }

  async function addEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !addKey.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/epics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: data.sprint.id, jiraKey: addKey.trim(), team: "CORE" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setAddError(b.error ?? `Ошибка ${res.status}`);
      } else {
        setAddKey("");
        await load();
      }
    } catch {
      setAddError("Сеть недоступна");
    } finally {
      setAdding(false);
    }
  }

  if (!data) return <p className="text-gray-400">Загрузка...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Эпики — Спринт {data.sprint.number}</h1>
      </div>

      {/* Добавить тикет */}
      <form onSubmit={addEpic} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 px-4 py-3">
        <input
          type="text"
          value={addKey}
          onChange={(e) => setAddKey(e.target.value.toUpperCase())}
          placeholder="Ключ тикета: SD-1234 / BF-5678"
          className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
        />
        <button
          type="submit"
          disabled={adding || !addKey.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
        >
          {adding ? "Добавляем…" : "Добавить"}
        </button>
        {addError && <span className="text-rose-400 text-xs">{addError}</span>}
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800 text-left">
              <th className="py-2 pr-4">Ключ</th>
              <th className="py-2 pr-4">Название</th>
              <th className="py-2 pr-4">Цель спринта</th>
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Статус Jira</th>
              <th className="py-2 pr-4 text-center">Чек-лист %</th>
              <th className="py-2 pr-4 text-center">Ретесты %</th>
              <th className="py-2 pr-4 text-center">Критбизнес</th>
              <th className="py-2 pr-4 text-center">Цель ✓</th>
              <th className="py-2 pr-4"></th>
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
                <td className="py-2 pr-4">
                  <input
                    type="text"
                    defaultValue={epic.goal ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (epic.goal ?? "")) updateEpic(epic.id, { goal: val });
                    }}
                    className="w-64 bg-gray-800 text-white rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
                  />
                </td>
                <td className="py-2 pr-4 text-gray-400">{epic.team}</td>
                <td className="py-2 pr-4 text-gray-400">{epic.jiraStatus ?? "—"}</td>
                <td className="py-2 pr-4 text-center">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={localFirstPass[epic.id] ?? epic.firstPass}
                    onChange={(e) =>
                      setLocalFirstPass((s) => ({
                        ...s,
                        [epic.id]: Math.min(100, Math.max(0, Number(e.target.value))),
                      }))
                    }
                    onBlur={() => {
                      const val = localFirstPass[epic.id] ?? epic.firstPass;
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
                <td className="py-2 pl-2 min-w-[80px]">
                  {saving[epic.id] && (
                    <span className="text-indigo-400 text-xs">Сохр...</span>
                  )}
                  {errors[epic.id] && (
                    <span className="text-red-400 text-xs" title={errors[epic.id]}>
                      ✗ {errors[epic.id]}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

