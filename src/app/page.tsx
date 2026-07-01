"use client";

import { useEffect, useMemo, useState } from "react";
import { type Team } from "@/data/sprint";
import { fmtRange, sprintCompletion, sprintProgress } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { EpicCard } from "@/components/EpicCard";
import { BoardDataProvider, useBoardData } from "@/components/BoardDataProvider";
import { SyncButton } from "@/components/SyncButton";

// Спец-режим зрителя: показать только свободный пул «Можно взять».
const FREE_VIEW = "__free__";

export default function Home() {
  return (
    <BoardDataProvider>
      <HomeInner />
    </BoardDataProvider>
  );
}

function HomeInner() {
  const { epics, members, assignments, sprint, syncedAt } = useBoardData();

  // Доска чисто клиентская. На сервере и в первом клиентском рендере отдаём
  // null — гидрировать нечего, поэтому инъекции браузерных расширений в DOM не
  // вызывают hydration-warning. Прелоадер и борда монтируются только после mount.
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setReady(true), 1000);
    return () => clearTimeout(t);
  }, []);

  const [team, setTeam] = useState<Team>("CORE");
  // null = общая борда (вся команда). Иначе — фокус на одном тестере.
  const [viewerId, setViewerId] = useState<string | null>(null);

  const teamMembers = useMemo(() => members.filter((m) => m.team === team), [members, team]);
  const teamEpics = useMemo(() => epics.filter((e) => e.team === team), [epics, team]);

  function switchTeam(t: Team) {
    setTeam(t);
    setViewerId(null);
  }

  const viewer =
    viewerId && viewerId !== FREE_VIEW
      ? teamMembers.find((m) => m.id === viewerId) ?? null
      : null;
  const freeView = viewerId === FREE_VIEW;

  const epicByKey = useMemo(() => new Map(epics.map((e) => [e.key, e])), [epics]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const asgByMember = useMemo(() => new Map(assignments.map((a) => [a.memberId, a])), [assignments]);

  const { dayNum, totalDays, pct: timePct } = sprintProgress(sprint, new Date());
  // Готовность спринта считаем из реальных процентов эпиков текущей команды.
  const completion = useMemo(() => sprintCompletion(teamEpics), [teamEpics]);
  // Темп: насколько готовность опережает (или отстаёт от) прошедшего времени.
  const pace = Math.round(completion - timePct);
  const paceMeta =
    pace >= 0
      ? { label: "успеваем", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" }
      : pace >= -10
        ? { label: "впритык", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" }
        : { label: "отстаём", cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30" };

  // Зона «Моё»
  const myAsg = viewer ? asgByMember.get(viewer.id) : undefined;
  const myEpics = (myAsg?.epicKeys ?? [])
    .map((k) => epicByKey.get(k))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  // Зона «В работе у команды» — все участники команды с назначениями
  const teamWork = teamMembers
    .map((m) => ({ member: m, asg: asgByMember.get(m.id) }))
    .filter((x) => x.asg && x.asg.epicKeys.length > 0);

  // Зона «Можно взять» — эпики команды без назначений (критбизнес идут первыми)
  const assignedKeys = new Set(
    assignments
      .filter((a) => memberById.get(a.memberId)?.team === team)
      .flatMap((a) => a.epicKeys),
  );
  const freeEpics = teamEpics
    .filter((e) => !assignedKeys.has(e.key))
    .sort((a, b) => (b.critbusiness ? 1 : 0) - (a.critbusiness ? 1 : 0));

  // Сколько карточек у конкретного тестера (только реально существующие эпики).
  const workCountOf = (memberId: string) =>
    (asgByMember.get(memberId)?.epicKeys ?? []).filter((k) => epicByKey.has(k)).length;

  const ownersOf = (key: string) =>
    assignments
      .filter((a) => a.epicKeys.includes(key) && memberById.get(a.memberId)?.team === team)
      .map((a) => memberById.get(a.memberId))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

  if (!mounted) return null; // SSR + первый клиентский рендер совпадают (оба пусты)
  if (!ready) return <Preloader />;

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col pt-5">
      {/* ===== Header ===== */}
      <header className="mb-5 rounded-2xl border border-white/10 bg-white/3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="whitespace-nowrap text-lg font-bold text-slate-100">QA Sprint Board</h1>
              <span className="shrink-0 whitespace-nowrap rounded-md bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300 ring-1 ring-inset ring-sky-500/30">
                Спринт {sprint.number}
              </span>
              {syncedAt && (
                <span className="whitespace-nowrap text-xs text-gray-600">
                  Обновлено из Jira: {new Date(syncedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <SyncButton />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {fmtRange(sprint)} · день {dayNum} из {totalDays} ·{" "}
              <a
                href={sprint.confluenceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                план в Confluence
              </a>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Team toggle */}
            <div className="flex rounded-lg border border-white/10 bg-[#0b0f17] p-0.5">
              {(["CORE", "eQA"] as Team[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTeam(t)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    team === t ? "bg-sky-500 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress — реальная готовность из данных эпиков vs прошедшее время */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500">Готовность спринта · {team}</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums text-slate-300">{completion}%</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${paceMeta.cls}`}
              >
                {paceMeta.label} · {pace >= 0 ? "+" : ""}{pace}%
              </span>
            </div>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-linear-to-r from-sky-500 to-emerald-400"
              style={{ width: `${completion}%` }}
            />
            {/* Маркер ожидаемого темпа: где «должны быть» по прошедшему времени */}
            <div
              className="absolute top-0 h-full w-0.5 bg-white/70"
              style={{ left: `${timePct}%` }}
              title={`Прошло времени: ${Math.round(timePct)}%`}
            />
          </div>
        </div>

        {/* Viewer selector */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setViewerId(null)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              !viewer && !freeView
                ? "bg-white/10 text-white ring-1 ring-inset ring-white/20"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            Вся команда
            <CountBadge n={assignedKeys.size} />
          </button>
          {freeEpics.length > 0 && (
            <button
              onClick={() => setViewerId(FREE_VIEW)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                freeView
                  ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-inset ring-emerald-500/40"
                  : "text-emerald-300/80 hover:bg-emerald-500/10"
              }`}
            >
              Можно взять
              <span className="rounded-full bg-emerald-500/25 px-1.5 text-[10px] font-bold tabular-nums text-emerald-100">
                {freeEpics.length}
              </span>
            </button>
          )}
          {teamMembers.map((m) => (
            <button
              key={m.id}
              onClick={() => setViewerId(m.id)}
              className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs transition ${
                viewer?.id === m.id
                  ? "bg-white/10 text-white ring-1 ring-inset ring-white/20"
                  : "text-slate-400 hover:bg-white/5"
              }`}
            >
              <Avatar id={m.id} name={m.name} size="sm" />
              {m.name.split(" ")[0]}
              <CountBadge n={workCountOf(m.id)} />
            </button>
          ))}
        </div>
      </header>

      {viewer ? (
        /* ===== Фокус на одном тестере ===== */
        <Zone
          title={`Задачи · ${viewer.name}`}
          subtitle={viewer.shift ? `смена ${viewer.shift}` : "на спринт"}
          count={myEpics.length}
          accent="sky"
        >
          {myEpics.length === 0 && (
            <Empty>Пока ничего не назначено</Empty>
          )}
          {myEpics.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {myEpics.map((e) => (
                <EpicCard key={e.key} epic={e} note={myAsg?.note} />
              ))}
            </div>
          )}
        </Zone>
      ) : freeView ? (
        /* ===== Свободный пул «Можно взять» ===== */
        <Zone
          title="Можно взять"
          subtitle="свободно / пиши лиду"
          count={freeEpics.length}
          accent="emerald"
          bodyClassName="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {freeEpics.length === 0 && <Empty>Свободных задач нет</Empty>}
          {freeEpics.map((e) => (
            <EpicCard key={e.key} epic={e} />
          ))}
        </Zone>
      ) : (
        /* ===== Общая борда: работа команды ===== */
        <div className="space-y-4">
          <Zone title="В работе у команды" subtitle="кто что тестит" count={teamWork.length} accent="amber">
            {teamWork.length === 0 && <Empty>Нет активных назначений</Empty>}
            {teamWork.map(({ member, asg }) => (
              <div key={member.id} className="space-y-2">
                <div className="flex items-center gap-2 px-0.5">
                  <Avatar id={member.id} name={member.name} size="sm" />
                  <span className="text-xs font-semibold text-slate-300">{member.name}</span>
                  {member.shift && <span className="text-[10px] text-slate-500">{member.shift}</span>}
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {asg!.epicKeys
                    .map((k) => epicByKey.get(k))
                    .filter((e): e is NonNullable<typeof e> => Boolean(e))
                    .map((e) => (
                      <EpicCard key={member.id + e.key} epic={e} />
                    ))}
                </div>
              </div>
            ))}
          </Zone>
        </div>
      )}

      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-600">
        сделано с любовью и багами M1
      </footer>
    </div>
  );
}

function Zone({
  title,
  subtitle,
  count,
  accent,
  bodyClassName,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  accent: "sky" | "amber" | "emerald" | "rose";
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const accentCls = {
    sky: "text-sky-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    rose: "text-rose-300",
  }[accent];
  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-white/2">
      <div className="flex items-baseline justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className={`text-sm font-bold ${accentCls}`}>{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-slate-400">
          {count}
        </span>
      </div>
      <div className={`p-3 ${bodyClassName ?? "flex flex-col gap-2.5"}`}>{children}</div>
    </section>
  );
}

function Preloader() {
  const { sprint } = useBoardData();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-100">QA Sprint Board</h1>
          <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300 ring-1 ring-inset ring-sky-500/30">
            Спринт {sprint.number}
          </span>
        </div>
        <p className="text-xs text-slate-500">SprutGaming · QA</p>
      </div>

      <div className="h-1.5 w-56 max-w-[70vw] overflow-hidden rounded-full bg-white/10">
        <div className="animate-loader-fill h-full rounded-full bg-linear-to-r from-sky-500 to-emerald-400" />
      </div>

      <p className="animate-pulse text-xs text-slate-500">Собираем спринт…</p>
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-bold tabular-nums text-slate-300">
      {n}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-xs text-slate-600">
      {children}
    </div>
  );
}
