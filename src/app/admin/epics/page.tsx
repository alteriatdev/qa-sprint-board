// src/app/admin/epics/page.tsx
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Trash2, X, CheckCircle2, Circle } from "lucide-react";

interface EpicRow {
  id: number; jiraKey: string; team: string; title: string | null;
  jiraStatus: string | null; firstPass: number; retestPct: number;
  critbusiness: boolean; task: boolean; goalDone: boolean; parallel: boolean;
  goal: string | null; priority: string;
  firstPassEnabled: boolean; retestEnabled: boolean; smokesEnabled: boolean;
  firstPassDone: boolean; retestDone: boolean; smokesDone: boolean;
}

interface SprintMeta { id: number; number: number; isActive: boolean }
interface SprintData { sprint: { id: number; number: number; isActive?: boolean }; epics: EpicRow[] }

const GOALS = [
  { key: "firstPass" as const, enabledKey: "firstPassEnabled" as const, doneKey: "firstPassDone" as const, label: "Чеклист" },
  { key: "retest"    as const, enabledKey: "retestEnabled"    as const, doneKey: "retestDone"    as const, label: "Ретесты на stage" },
  { key: "smokes"    as const, enabledKey: "smokesEnabled"    as const, doneKey: "smokesDone"    as const, label: "Смоки на DemoView" },
] as const;

export default function AdminEpics() {
  const [sprints, setSprints] = useState<SprintMeta[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SprintData | null>(null);
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});
  const [addKey, setAddKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Drawer state
  const [drawerEpic, setDrawerEpic] = useState<EpicRow | null>(null);
  const [draft, setDraft] = useState<Partial<EpicRow>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sprint")
      .then((r) => r.json())
      .then((list: SprintMeta[]) => {
        const sorted = [...list].sort((a, b) => {
          if (a.isActive) return -1;
          if (b.isActive) return 1;
          return b.number - a.number;
        });
        setSprints(sorted);
        const active = sorted.find((s) => s.isActive);
        setSelectedId(active?.id ?? sorted[0]?.id ?? null);
      });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const load = useCallback(async (id: number) => {
    const res = await fetch(`/api/sprint/${id}`);
    const d = await res.json() as SprintData;
    setData(d);
  }, []);

  useEffect(() => {
    if (selectedId !== null) load(selectedId);
  }, [selectedId, load]);

  function openDrawer(epic: EpicRow) {
    setDrawerEpic(epic);
    setDraft({
      goal: epic.goal ?? "",
      firstPass: epic.firstPass,
      critbusiness: epic.critbusiness,
      firstPassEnabled: epic.firstPassEnabled,
      retestEnabled: epic.retestEnabled,
      smokesEnabled: epic.smokesEnabled,
      firstPassDone: epic.firstPassDone,
      retestDone: epic.retestDone,
      smokesDone: epic.smokesDone,
    });
    setSaveError(null);
  }

  function closeDrawer() {
    setDrawerEpic(null);
    setDraft({});
  }

  async function saveDrawer() {
    if (!drawerEpic) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/epics/${drawerEpic.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, updatedBy: "admin" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(b.error ?? `Ошибка ${res.status}`);
        return;
      }
      if (selectedId !== null) await load(selectedId);
      // Обновляем drawerEpic из свежих данных
      setDrawerEpic(null);
    } finally {
      setSaving(false);
    }
  }

  async function addEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !addKey.trim()) return;
    const rawInput = addKey.trim();
    const urlMatch = rawInput.match(/\/browse\/([A-Z]+-\d+)/i);
    const resolvedKey = urlMatch ? urlMatch[1].toUpperCase() : rawInput.toUpperCase();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/epics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: data.sprint.id, jiraKey: resolvedKey, team: "CORE" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setAddError(b.error ?? `Ошибка ${res.status}`);
      } else {
        setAddKey("");
        if (selectedId !== null) await load(selectedId);
      }
    } catch {
      setAddError("Сеть недоступна");
    } finally {
      setAdding(false);
    }
  }

  async function deleteEpic(id: number, key: string) {
    if (!confirm(`Удалить ${key} с борды?`)) return;
    setDeleting((s) => ({ ...s, [id]: true }));
    try {
      await fetch(`/api/epics/${id}`, { method: "DELETE" });
      if (drawerEpic?.id === id) closeDrawer();
      if (selectedId !== null) await load(selectedId);
    } finally {
      setDeleting((s) => ({ ...s, [id]: false }));
    }
  }

  if (!data) return <p className="text-gray-400">Загрузка...</p>;

  return (
    <div className="relative">
      {/* ===== Основная колонка ===== */}
      <div className={`flex flex-col gap-6 transition-[padding-right] duration-300 ease-out ${drawerEpic ? "pr-[344px]" : "pr-0"}`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">
            Задачи — Спринт {data.sprint.number}
            {data.sprint.isActive === false && (
              <span className="ml-3 text-sm font-normal text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">не активен</span>
            )}
          </h1>
          {sprints.length > 0 && (
            <div ref={dropdownRef} className="relative text-sm">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                <span>{(() => { const s = sprints.find((s) => s.id === selectedId); return s ? `Спринт ${s.number}${s.isActive ? " (активный)" : ""}` : "—"; })()}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-gray-800 border border-white/10 rounded-xl shadow-xl overflow-hidden">
                  {sprints.map((s) => (
                    <button key={s.id} onClick={() => { setSelectedId(s.id); setDropdownOpen(false); }}
                      className={["w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors", s.id === selectedId ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-white/8 hover:text-white"].join(" ")}>
                      <span>Спринт {s.number}</span>
                      {s.isActive && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">активный</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
          <button type="submit" disabled={adding || !addKey.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium">
            {adding ? "Добавляем…" : "Добавить"}
          </button>
          {addError && <span className="text-rose-400 text-xs">{addError}</span>}
        </form>

        {/* Slim таблица */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800 text-left">
                <th className="py-2 pr-4 w-24">Ключ</th>
                <th className="py-2 pr-4">Название</th>
                <th className="py-2 pr-4 w-40">Цели</th>
                <th className="py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {data.epics.map((epic) => {
                const isSelected = drawerEpic?.id === epic.id;
                return (
                  <tr
                    key={epic.id}
                    onClick={() => openDrawer(epic)}
                    className={`border-b border-gray-800/50 cursor-pointer transition-colors ${isSelected ? "bg-indigo-900/30" : "hover:bg-gray-900/50"}`}
                  >
                    <td className="py-2.5 pr-4">
                      <a href={`https://sprutgaming.atlassian.net/browse/${epic.jiraKey}`} target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()} className="text-indigo-400 hover:underline font-mono text-xs">
                        {epic.jiraKey}
                      </a>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-200">
                      <div className="truncate">{epic.title ?? <span className="text-gray-600 italic">не синкнуто</span>}</div>
                      {epic.critbusiness && (
                        <span className="text-[10px] text-rose-400 font-semibold">КРИТБИЗНЕС</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1">
                        {GOALS.filter((g) => !(epic.task && g.key === "firstPass")).map((g) => {
                          const enabled = epic[g.enabledKey] as boolean;
                          const done = epic[g.doneKey] as boolean;
                          if (!enabled) return null;
                          return (
                            <span key={g.key} title={g.label}
                              className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded leading-none
                                ${done
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-gray-800 text-gray-500"}`}>
                              <span>{done ? "✓" : "○"}</span>
                              <span>{g.label.split(" ")[0]}</span>
                            </span>
                          );
                        })}
                        {GOALS.every((g) => !(epic[g.enabledKey] as boolean)) && (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <button onClick={(e) => { e.stopPropagation(); deleteEpic(epic.id, epic.jiraKey); }}
                        disabled={deleting[epic.id]}
                        className="p-1.5 text-gray-600 hover:text-rose-400 disabled:opacity-30 transition-colors rounded" title="Удалить">
                        {deleting[epic.id] ? "…" : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Боковая панель (drawer) ===== */}
      <div className={`fixed top-0 right-0 h-screen w-80 z-50
        bg-gray-950 border-l border-white/10 overflow-y-auto p-6 flex flex-col gap-5
        transition-transform duration-300 ease-out
        ${drawerEpic ? "translate-x-0" : "translate-x-full"}`}>
        {drawerEpic && (<>
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a href={`https://sprutgaming.atlassian.net/browse/${drawerEpic.jiraKey}`} target="_blank" rel="noreferrer"
                className="text-indigo-400 hover:underline font-mono text-sm font-semibold">
                {drawerEpic.jiraKey}
              </a>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{drawerEpic.title}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {drawerEpic.team && (
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono">{drawerEpic.team}</span>
                )}
                {drawerEpic.jiraStatus && (
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">{drawerEpic.jiraStatus}</span>
                )}
                {!drawerEpic.task && drawerEpic.retestPct != null && (
                  <span className="text-xs bg-indigo-500/15 text-indigo-300 px-2 py-1 rounded">ретесты {drawerEpic.retestPct}%</span>
                )}
              </div>
            </div>
            <button onClick={closeDrawer} className="p-1 text-gray-500 hover:text-white transition shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Цель спринта */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Цель спринта</label>
            <textarea
              rows={3}
              value={(draft.goal as string) ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
              placeholder="Опиши цель..."
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Чек-лист % — только для эпиков */}
          {!drawerEpic.task && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Чек-лист %</label>
              <input
                type="number"
                min={0} max={100}
                value={(draft.firstPass as number) ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, firstPass: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Цели спринта */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Цели применимы</p>
            {GOALS.filter((g) => !(drawerEpic.task && g.key === "firstPass")).map((g) => (
              <label key={g.key} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={(draft[g.enabledKey] as boolean) ?? true}
                  onChange={(e) => setDraft((d) => ({ ...d, [g.enabledKey]: e.target.checked }))}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span className="text-sm text-gray-300 group-hover:text-white transition">{g.label}</span>
              </label>
            ))}
          </div>

          {/* Выполнено */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Выполнено</p>
            {GOALS.filter((g) => !(drawerEpic.task && g.key === "firstPass")).map((g) => {
              const enabled = (draft[g.enabledKey] as boolean) ?? true;
              const done = (draft[g.doneKey] as boolean) ?? false;
              return (
                <label key={g.key} className={`flex items-center gap-2.5 cursor-pointer group ${!enabled ? "opacity-30 pointer-events-none" : ""}`}>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => setDraft((d) => ({ ...d, [g.doneKey]: e.target.checked }))}
                    className="sr-only"
                    disabled={!enabled}
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white transition flex items-center gap-1.5">
                    {done
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      : <Circle className="w-4 h-4 text-gray-600 shrink-0" />}
                    {g.label}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Флаги */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Флаги</p>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={(draft.critbusiness as boolean) ?? false}
                onChange={(e) => setDraft((d) => ({ ...d, critbusiness: e.target.checked }))}
                className="accent-rose-500 w-4 h-4"
              />
              <span className="text-sm text-gray-300 group-hover:text-white transition">Критбизнес</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={(draft.parallel as boolean) ?? false}
                onChange={(e) => setDraft((d) => ({ ...d, parallel: e.target.checked }))}
                className="accent-violet-500 w-4 h-4"
              />
              <span className="text-sm text-gray-300 group-hover:text-white transition">Параллельная разработка</span>
            </label>
          </div>

          {/* Save */}
          {saveError && <p className="text-rose-400 text-xs">{saveError}</p>}
          <button
            onClick={saveDrawer}
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </>)}
      </div>
    </div>
  );
}
