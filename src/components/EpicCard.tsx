"use client";

import { useState } from "react";
import { CalendarClock, Target } from "lucide-react";
import type { Epic, Member } from "@/data/sprint";
import { progressColor } from "@/lib/format";
import { Avatar } from "./Avatar";
import { PriorityBadge, StatusBadge } from "./Badges";
import { EpicGraphModal } from "./EpicGraphModal";

// Общий срок завершения ретестов на stage для эпиков группы «Бонусы».
const BONUS_RETEST_ETA = "19.06.2026";

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
        epic.goalDone
          ? "border-emerald-500/40 bg-emerald-500/10"
          : epic.critbusiness
            ? "border-red-500/40 bg-red-500/6"
            : epic.bonus
              ? "border-violet-500/40 bg-violet-500/6"
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
          {epic.bonus && (
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300 ring-1 ring-inset ring-violet-500/40">
              Бонусы
            </span>
          )}
        </div>
        <StatusBadge status={epic.jiraStatus} />
      </div>

      <h3 className="text-sm font-semibold leading-snug text-slate-100">{epic.title}</h3>

      <div className="rounded-lg bg-white/5 p-2.5 ring-1 ring-inset ring-white/10">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
          <Target className="h-3 w-3" />
          Цель спринта
        </div>
        <p className="text-xs leading-relaxed text-slate-200">{epic.goal}</p>
      </div>

      {!epic.task &&
        (() => {
          // Две шкалы всегда. Если идут ретесты — первая проходка по чек-листу
          // уже завершена, поэтому firstPass принимаем за 100%.
          const inRetest = epic.progress?.retest !== undefined;
          const firstPass = inRetest ? 100 : epic.progress?.firstPass;
          return (
            <div className="flex flex-col gap-2">
              <ProgressBar label="Тесты по чек-листу на stage" value={firstPass} />
              <ProgressBar label="Ретесты на stage" value={epic.progress?.retest} />
            </div>
          );
        })()}

      {epic.bonus && (
        <div className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          Завершение ретестов на stage ожидается {BONUS_RETEST_ETA}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <PriorityBadge priority={epic.priority} />
        <LinkPill href={epic.links.jira} label="Jira" />
        {epic.links.checklist && <LinkPill href={epic.links.checklist} label="Чек-лист" />}
        {epic.links.testChannel && <LinkPill href={epic.links.testChannel} label="Тест-канал" />}
      </div>

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
