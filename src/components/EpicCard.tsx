"use client";

import { useState } from "react";
import { Target, CheckCircle2, Circle } from "lucide-react";
import type { Epic, Member } from "@/data/sprint";
import { progressColor, epicCompletion } from "@/lib/format";
import { Avatar } from "./Avatar";
import { StatusBadge } from "./Badges";
import { EpicGraphModal } from "./EpicGraphModal";

function ProgressBar({ label, value }: { label: string; value?: number }) {
  const pct = Math.min(Math.max(value ?? 0, 0), 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold tabular-nums text-slate-300">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${progressColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LinkPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 hover:text-white"
    >
      {label}
    </a>
  );
}

const GOALS = [
  {
    key: "firstPass" as const,
    enabledKey: "firstPassEnabled" as const,
    doneKey: "firstPassDone" as const,
    label: "Первая проходка",
    progressKey: "firstPass" as const,
  },
  {
    key: "retest" as const,
    enabledKey: "retestEnabled" as const,
    doneKey: "retestDone" as const,
    label: "Ретесты на stage",
    progressKey: "retest" as const,
  },
  {
    key: "smokes" as const,
    enabledKey: "smokesEnabled" as const,
    doneKey: "smokesDone" as const,
    label: "Смоки на DemoView",
    progressKey: null,
  },
] as const;

function GoalRow({ label, done, progress }: { label: string; done: boolean; progress?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-1.5 text-[11px] ${done ? "text-emerald-300" : "text-slate-400"}`}>
        {done
          ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          : <Circle className="h-3.5 w-3.5 shrink-0" />
        }
        <span className={done ? "line-through opacity-70" : ""}>{label}</span>
      </div>
      {progress !== undefined && !done && (
        <div className="ml-5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${progressColor(progress)}`}
              style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function EpicCard({
  epic,
  owners,
  note,
}: {
  epic: Epic;
  owners?: Member[];
  note?: string;
}) {
  const [graphOpen, setGraphOpen] = useState(false);
  const allDone = epicCompletion(epic) === 100;
  const enabledGoals = GOALS.filter((g) => epic[g.enabledKey] !== false);

  return (
    <article
      onClick={() => setGraphOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setGraphOpen(true);
        }
      }}
      className={`group flex cursor-pointer flex-col gap-2.5 rounded-xl border p-3.5 transition hover:border-white/20 ${
        allDone
          ? "border-emerald-500/40 bg-emerald-500/10"
          : epic.critbusiness
            ? "border-red-500/40 bg-red-500/6"
            : "border-white/10 bg-white/3"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={epic.links.jira}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs font-semibold text-sky-300 transition hover:text-sky-200 hover:underline"
          >
            {epic.key}
          </a>
          {epic.critbusiness && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300 ring-1 ring-inset ring-red-500/40">
              Критбизнес
            </span>
          )}
        </div>
        <StatusBadge status={epic.jiraStatus} />
      </div>

      <h3 className="text-sm font-semibold leading-snug text-slate-100">{epic.title}</h3>

      {/* Прогресс-бары — только для эпиков */}
      {!epic.task && (
        <div className="flex flex-col gap-2">
          <ProgressBar label="Чек-лист" value={epic.progress?.firstPass} />
          <ProgressBar label="Ретесты" value={epic.progress?.retest} />
        </div>
      )}

      {/* Цели спринта — какие задачи стоят на этот спринт */}
      {enabledGoals.length > 0 && (
        <div className="mt-auto flex flex-col gap-1.5 rounded-lg bg-white/3 p-2.5 ring-1 ring-inset ring-white/8">
          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
            <Target className="h-3 w-3" />
            Цели
          </div>
          {(epic.task ? enabledGoals.filter((g) => g.key !== "firstPass") : enabledGoals).map((g) => (
            <div key={g.key} className={`flex items-center gap-1.5 text-[11px] ${epic[g.doneKey] ? "text-emerald-300" : "text-slate-400"}`}>
              {epic[g.doneKey]
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                : <Circle className="h-3.5 w-3.5 shrink-0" />}
              <span className={epic[g.doneKey] ? "line-through opacity-60" : ""}>{g.label}</span>
            </div>
          ))}
        </div>
      )}

      {(epic.links.checklist || epic.links.testChannel) && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {epic.links.checklist && <LinkPill href={epic.links.checklist} label="Чек-лист" />}
          {epic.links.testChannel && <LinkPill href={epic.links.testChannel} label="Тест-канал" />}
        </div>
      )}

      {owners && owners.length > 0 && (
        <div className="flex items-center gap-2 border-t border-white/10 pt-2.5">
          <div className="flex -space-x-2">
            {owners.map((o) => (
              <Avatar key={o.id} id={o.id} name={o.name} size="sm" />
            ))}
          </div>
          <span className="truncate text-[11px] text-slate-400">
            {owners.map((o) => o.name).join(", ")}
            {note ? ` — ${note}` : ""}
          </span>
        </div>
      )}

      <EpicGraphModal epic={epic} open={graphOpen} onClose={() => setGraphOpen(false)} />
    </article>
  );
}
