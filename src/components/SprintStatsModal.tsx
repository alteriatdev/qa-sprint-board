"use client";
import { useEffect, useState } from "react";

interface Goal { key: string; text: string; done: boolean }
interface PersonStat {
  id: string; name: string; team: string;
  assigned: number; closed: number; closeRate: number;
  avgFirstPass: number | null; avgRetest: number; bugs: number;
}
interface SprintStats {
  sprint: { id: number; number: number; start: string; end: string; isActive: boolean };
  overview: {
    total: number; donePct: number;
    statusCounts: Record<string, number>;
    avgFirstPass: number | null;
    totalBugs: number;
    goals: { total: number; done: number; list: Goal[] };
    crit: { total: number; done: number };
  };
  persons: PersonStat[];
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  done:          { label: "Готово",        color: "bg-emerald-500" },
  rf_release:    { label: "RF Release",    color: "bg-teal-500" },
  qa_testing:    { label: "QA Testing",    color: "bg-indigo-500" },
  rf_qa:         { label: "RF QA",         color: "bg-violet-500" },
  in_development:{ label: "In Dev",        color: "bg-blue-500" },
  block_tests:   { label: "Блок тесты",    color: "bg-orange-500" },
  reopen:        { label: "Reopen",        color: "bg-rose-500" },
  analysis:      { label: "Analysis",      color: "bg-yellow-500" },
  backlog:       { label: "Backlog",       color: "bg-gray-500" },
};

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center">
      <svg className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
      </svg>
      <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-lg bg-gray-800 border border-white/10 px-3 py-2 text-xs text-gray-300 leading-relaxed shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800" />
        {text}
      </span>
    </span>
  );
}

function Stat({ label, value, sub, tooltip }: { label: string; value: string | number; sub?: string; tooltip?: string }) {
  return (
    <div className="bg-white/5 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function SprintStatsModal({ sprintId, onClose }: { sprintId: number; onClose: () => void }) {
  const [stats, setStats] = useState<SprintStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sprint/${sprintId}/stats`)
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); });
  }, [sprintId]);

  // Закрытие по Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-white/10 rounded-2xl shadow-2xl">
        {loading || !stats ? (
          <div className="flex items-center justify-center h-48 text-gray-400">Загрузка...</div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-900 border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Статистика — Спринт {stats.sprint.number}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {stats.sprint.start} — {stats.sprint.end}
                  {stats.sprint.isActive && (
                    <span className="ml-2 text-emerald-400">● активный</span>
                  )}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Overview cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat
                  label="Закрыто эпиков"
                  value={`${stats.overview.donePct}%`}
                  sub={`${stats.overview.statusCounts["done"] ?? 0} из ${stats.overview.total}`}
                  tooltip="Доля эпиков со статусом «Done» из всех эпиков спринта. Статус берётся из Jira и кэшируется при синке."
                />
                <Stat
                  label="Цели выполнены"
                  value={`${stats.overview.goals.total > 0 ? Math.round((stats.overview.goals.done / stats.overview.goals.total) * 100) : 0}%`}
                  sub={`${stats.overview.goals.done} из ${stats.overview.goals.total}`}
                  tooltip="Цель считается выполненной, если у эпика заполнено поле «Цель спринта» и стоит галочка «Цель ✓» в админке. Учитываются только эпики с заполненной целью."
                />
                <Stat
                  label="Avg firstPass"
                  value={stats.overview.avgFirstPass !== null ? `${stats.overview.avgFirstPass}%` : "—"}
                  sub="качество проходки"
                  tooltip="Средний % прохождения чеклиста с первой попытки по всем эпикам, где значение выставлено вручную в админке (нули без правок не учитываются). Чем выше — тем меньше дыр при первичном тестировании."
                />
                <Stat
                  label="Баги найдено"
                  value={stats.overview.totalBugs}
                  sub={stats.overview.crit.total > 0
                    ? `критбизнес: ${stats.overview.crit.done}/${stats.overview.crit.total}`
                    : "по графам эпиков"}
                  tooltip="Сумма дочерних задач типа «Bug» из графов всех эпиков спринта (кэшируются при синке с Jira). Не включает баги в связанных задачах."
                />
              </div>

              {/* Status breakdown */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Статусы эпиков</h3>
                <div className="space-y-2">
                  {Object.entries(stats.overview.statusCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                      const meta = STATUS_LABEL[status] ?? { label: status, color: "bg-gray-500" };
                      const pct = stats.overview.total > 0 ? Math.round((count / stats.overview.total) * 100) : 0;
                      return (
                        <div key={status} className="flex items-center gap-3">
                          <div className="w-28 text-xs text-gray-400 truncate">{meta.label}</div>
                          <div className="flex-1">
                            <Bar pct={pct} color={meta.color} />
                          </div>
                          <div className="text-xs text-gray-400 w-12 text-right">{count} ({pct}%)</div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Goals */}
              {stats.overview.goals.list.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Цели спринта</h3>
                  <div className="space-y-1.5">
                    {stats.overview.goals.list.map((g) => (
                      <div key={g.key} className="flex items-start gap-2.5 text-sm">
                        <span className={`mt-0.5 shrink-0 ${g.done ? "text-emerald-400" : "text-rose-400"}`}>
                          {g.done ? "✓" : "✗"}
                        </span>
                        <span className={g.done ? "text-gray-300" : "text-white"}>{g.text}</span>
                        <span className="ml-auto text-xs text-gray-600 shrink-0">{g.key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-person */}
              {stats.persons.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">По тестировщикам</h3>
                    <InfoTooltip text="Close rate — закрытые эпики из назначенных. FP — средний firstPass %. RT — средний retest %. Баги — из графов назначенных эпиков. Сортировка по close rate." />
                  </div>
                  <div className="space-y-2">
                    {stats.persons.map((p) => (
                      <div key={p.id} className="bg-white/5 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm">{p.name}</span>
                            <span className="text-xs text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">{p.team}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span>{p.closed}/{p.assigned} закрыто</span>
                            {p.avgFirstPass !== null && (
                              <span className={p.avgFirstPass >= 80 ? "text-emerald-400" : p.avgFirstPass >= 50 ? "text-yellow-400" : "text-rose-400"}>
                                FP {p.avgFirstPass}%
                              </span>
                            )}
                            {p.avgRetest > 0 && <span className="text-violet-400">RT {p.avgRetest}%</span>}
                            {p.bugs > 0 && <span className="text-orange-400">🐛 {p.bugs}</span>}
                          </div>
                        </div>
                        <Bar
                          pct={p.closeRate}
                          color={p.closeRate >= 80 ? "bg-emerald-500" : p.closeRate >= 50 ? "bg-yellow-500" : "bg-rose-500"}
                        />
                        <div className="text-xs text-gray-600 mt-1">{p.closeRate}% close rate</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
