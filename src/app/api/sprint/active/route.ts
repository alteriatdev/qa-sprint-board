// src/app/api/sprint/active/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isEpicType } from "@/lib/jira";

export async function GET(_request?: Request) {
  // Активный спринт
  // start_date/end_date кастим в text: иначе neon парсит DATE в JS Date в
  // локальной зоне (наружу уходит ...T21:00:00Z), фронт клеит "+T00:00:00" и
  // получает Invalid Date → NaN. На Vercel (UTC) дата ещё и съезжала на день.
  const sprints = (await sql`
    SELECT id, number, start_date::text AS start_date, end_date::text AS end_date, confluence_url
    FROM sprints WHERE is_active = true LIMIT 1
  `) as Array<{
    id: number; number: number; start_date: string; end_date: string; confluence_url: string;
  }>;

  if (sprints.length === 0) {
    return NextResponse.json({ error: "No active sprint" }, { status: 404 });
  }
  const s = sprints[0];

  // Эпики + jira_cache + progress
  const epics = (await sql`
    SELECT
      se.id, se.sprint_id, se.jira_key, se.team, se.priority,
      se.goal, se.critbusiness, se.task, se.goal_done, se.sort_order,
      se.first_pass_enabled, se.retest_enabled, se.smokes_enabled,
      se.first_pass_done, se.retest_done, se.smokes_done, se.parallel,
      jc.title, jc.jira_status, jc.assignee_name, jc.issue_type,
      COALESCE(jc.retest_pct, 0) AS retest_pct,
      COALESCE(pe.first_pass, 0) AS first_pass
    FROM sprint_epics se
    LEFT JOIN jira_cache jc ON jc.jira_key = se.jira_key
    LEFT JOIN progress_entries pe ON pe.sprint_id = se.sprint_id AND pe.jira_key = se.jira_key
    WHERE se.sprint_id = ${s.id}
    ORDER BY se.sort_order ASC
  `) as Array<{
    id: number; sprint_id: number; jira_key: string; team: string; priority: string;
    goal: string | null; critbusiness: boolean; task: boolean;
    goal_done: boolean; sort_order: number;
    first_pass_enabled: boolean; retest_enabled: boolean; smokes_enabled: boolean;
    first_pass_done: boolean; retest_done: boolean; smokes_done: boolean; parallel: boolean;
    title: string | null; jira_status: string | null; assignee_name: string | null;
    issue_type: string | null;
    retest_pct: number; first_pass: number;
  }>;

  // Участники
  const memberRows = (await sql`
    SELECT id, name, slack_id, team, role, shift
    FROM members ORDER BY team, name
  `) as Array<{
    id: string; name: string; slack_id: string | null; team: string;
    role: string | null; shift: string | null;
  }>;

  // Назначения
  const assignmentRows = (await sql`
    SELECT id, sprint_id, member_id, jira_key, note
    FROM assignments WHERE sprint_id = ${s.id}
  `) as Array<{
    id: number; sprint_id: number; member_id: string; jira_key: string; note: string | null;
  }>;

  // Время последнего синка
  const syncRows = (await sql`
    SELECT MIN(synced_at) AS synced_at FROM jira_cache
    WHERE jira_key IN (SELECT jira_key FROM sprint_epics WHERE sprint_id = ${s.id})
  `) as Array<{ synced_at: string | null }>;
  const syncedAt = syncRows[0]?.synced_at ?? null;

  return NextResponse.json({
    sprint: {
      id: s.id,
      number: s.number,
      start: s.start_date,
      end: s.end_date,
      confluenceUrl: s.confluence_url,
    },
    epics: epics.map((e) => ({
      id: e.id,
      sprintId: e.sprint_id,
      jiraKey: e.jira_key,
      team: e.team,
      priority: e.priority,
      goal: e.goal,
      critbusiness: e.critbusiness,
      task: e.issue_type != null ? !isEpicType(e.issue_type) : e.task,
      goalDone: e.goal_done,
      firstPassEnabled: e.first_pass_enabled,
      retestEnabled: e.retest_enabled,
      smokesEnabled: e.smokes_enabled,
      firstPassDone: e.first_pass_done,
      retestDone: e.retest_done,
      smokesDone: e.smokes_done,
      parallel: e.parallel,
      sortOrder: e.sort_order,
      title: e.title,
      jiraStatus: e.jira_status,
      assigneeName: e.assignee_name,
      retestPct: e.retest_pct,
      firstPass: e.first_pass,
    })),
    members: memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      slackId: m.slack_id,
      team: m.team,
      role: m.role,
      shift: m.shift,
    })),
    assignments: assignmentRows.map((a) => ({
      id: a.id,
      sprintId: a.sprint_id,
      memberId: a.member_id,
      jiraKey: a.jira_key,
      note: a.note,
    })),
    syncedAt,
  });
}
