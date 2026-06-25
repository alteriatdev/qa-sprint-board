// src/app/api/sprint/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isEpicType } from "@/lib/jira";
import { notFound } from "@/lib/http";

interface Params { params: Promise<{ id: string }> }

// GET /api/sprint/:id — данные любого спринта (та же форма что /api/sprint/active)
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const sprints = (await sql`
    SELECT id, number, start_date::text AS start_date, end_date::text AS end_date,
           confluence_url, is_active
    FROM sprints WHERE id = ${id} LIMIT 1
  `) as Array<{
    id: number; number: number; start_date: string; end_date: string;
    confluence_url: string; is_active: boolean;
  }>;

  if (sprints.length === 0) return notFound("Спринт не найден");
  const s = sprints[0];

  const epics = (await sql`
    SELECT
      se.id, se.sprint_id, se.jira_key, se.team, se.priority,
      se.goal, se.critbusiness, se.task, se.goal_done, se.sort_order,
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
    title: string | null; jira_status: string | null; assignee_name: string | null;
    issue_type: string | null; retest_pct: number; first_pass: number;
  }>;

  const memberRows = (await sql`
    SELECT id, name, slack_id, team, role, on_vacation, shift
    FROM members ORDER BY team, name
  `) as Array<{
    id: string; name: string; slack_id: string | null; team: string;
    role: string | null; on_vacation: boolean; shift: string | null;
  }>;

  const assignmentRows = (await sql`
    SELECT id, sprint_id, member_id, jira_key, note
    FROM assignments WHERE sprint_id = ${s.id}
  `) as Array<{
    id: number; sprint_id: number; member_id: string; jira_key: string; note: string | null;
  }>;

  const syncRows = (await sql`
    SELECT MIN(synced_at) AS synced_at FROM jira_cache
    WHERE jira_key IN (SELECT jira_key FROM sprint_epics WHERE sprint_id = ${s.id})
  `) as Array<{ synced_at: string | null }>;

  return NextResponse.json({
    sprint: {
      id: s.id,
      number: s.number,
      start: s.start_date,
      end: s.end_date,
      confluenceUrl: s.confluence_url,
      isActive: s.is_active,
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
      sortOrder: e.sort_order,
      title: e.title,
      jiraStatus: e.jira_status,
      assigneeName: e.assignee_name,
      retestPct: e.retest_pct,
      firstPass: e.first_pass,
    })),
    members: memberRows.map((m) => ({
      id: m.id, name: m.name, slackId: m.slack_id,
      team: m.team, role: m.role, onVacation: m.on_vacation, shift: m.shift,
    })),
    assignments: assignmentRows.map((a) => ({
      id: a.id, sprintId: a.sprint_id, memberId: a.member_id,
      jiraKey: a.jira_key, note: a.note,
    })),
    syncedAt: syncRows[0]?.synced_at ?? null,
  });
}
