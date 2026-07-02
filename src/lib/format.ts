import type { Epic, JiraStatus, Priority, Sprint } from "@/data/sprint";

// Лейблы повторяют реальные статусы Jira 1:1, чтобы доска совпадала с тем,
// что видно в задаче. Цвета сгруппированы по смыслу воркфлоу.
export const statusMeta: Record<
  JiraStatus,
  { label: string; dot: string; chip: string }
> = {
  analysis: { label: "Analysis", dot: "bg-slate-400", chip: "bg-slate-500/15 text-slate-300 ring-slate-500/30" },
  backlog: { label: "Backlog", dot: "bg-zinc-400", chip: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30" },
  in_development: { label: "In development", dot: "bg-amber-400", chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  block_tests: { label: "Блок тесты", dot: "bg-orange-400", chip: "bg-orange-500/15 text-orange-300 ring-orange-500/30" },
  reopen: { label: "Реопен", dot: "bg-rose-400", chip: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  rf_qa: { label: "R.F. QA", dot: "bg-violet-400", chip: "bg-violet-500/15 text-violet-300 ring-violet-500/30" },
  qa_testing: { label: "QA testing", dot: "bg-sky-400", chip: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  rf_release: { label: "R.F Release", dot: "bg-teal-400", chip: "bg-teal-500/15 text-teal-300 ring-teal-500/30" },
  done: { label: "Готово", dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
};

export const priorityMeta: Record<Priority, { label: string; chip: string } | null> = {
  highest: { label: "Наивысший", chip: "bg-red-500/15 text-red-300 ring-red-500/30" },
  high: { label: "Высокий", chip: "bg-orange-500/15 text-orange-300 ring-orange-500/30" },
  none: null,
};

const clampPct = (n: number) => Math.min(Math.max(n, 0), 100);

// Готовность одного эпика: done_goals / enabled_goals * 100.
// Если ни одна цель не включена — считаем 0 (не настроено).
export function epicCompletion(epic: Epic): number {
  const goals: Array<{ enabled: boolean; done: boolean }> = [
    { enabled: epic.firstPassEnabled ?? true, done: epic.firstPassDone ?? false },
    { enabled: epic.retestEnabled ?? true,    done: epic.retestDone    ?? false },
    { enabled: epic.smokesEnabled ?? true,    done: epic.smokesDone    ?? false },
  ];
  const enabled = goals.filter((g) => g.enabled);
  if (enabled.length === 0) return 0;
  const done = enabled.filter((g) => g.done).length;
  return Math.round((done / enabled.length) * 100);
}

// Средняя готовность спринта по всем эпикам/задачам (0–100).
export function sprintCompletion(list: Epic[]): number {
  if (list.length === 0) return 0;
  const sum = list.reduce((acc, e) => acc + epicCompletion(e), 0);
  return Math.round(sum / list.length);
}

// Цвет шкалы готовности по проценту из отчётов QA.
export function progressColor(pct: number): string {
  if (pct >= 100) return "bg-emerald-400";
  if (pct >= 67) return "bg-sky-400";
  if (pct >= 34) return "bg-amber-400";
  return "bg-rose-400";
}

const MS_DAY = 86_400_000;

export function sprintProgress(sprint: Sprint, today = new Date()) {
  const start = new Date(sprint.start + "T00:00:00");
  const end = new Date(sprint.endInclusive + "T23:59:59");
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_DAY) + 1;
  const dayNum = Math.min(
    Math.max(Math.floor((today.getTime() - start.getTime()) / MS_DAY) + 1, 1),
    totalDays,
  );
  const pct = Math.min(Math.max((dayNum / totalDays) * 100, 0), 100);
  return { dayNum, totalDays, pct };
}

export function fmtRange(sprint: Sprint): string {
  const f = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  return `${f(sprint.start)} – ${f(sprint.endInclusive)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Стабильный цвет аватара по id.
const AVATAR_COLORS = [
  "bg-rose-500/80",
  "bg-amber-500/80",
  "bg-emerald-500/80",
  "bg-sky-500/80",
  "bg-violet-500/80",
  "bg-fuchsia-500/80",
  "bg-cyan-500/80",
  "bg-lime-500/80",
];

export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
