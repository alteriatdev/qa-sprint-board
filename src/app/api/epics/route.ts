// src/app/api/epics/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, serverError, isNonEmptyString } from "@/lib/http";
import { fetchEpicsMeta, fetchRetestPct } from "@/lib/jira";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const body = await parseBody<{
    sprintId: number; jiraKey: string; team: string;
    priority?: string; goal?: string; critbusiness?: boolean; task?: boolean;
  }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");

  if (typeof body.sprintId !== "number") return badRequest("sprintId обязателен (число)");
  if (!isNonEmptyString(body.jiraKey)) return badRequest("jiraKey обязателен");
  if (!isNonEmptyString(body.team)) return badRequest("team обязателен");

  const key = body.jiraKey.trim().toUpperCase();

  try {
    // Определяем team из QA-поля Jira; fallback — body.team (CORE по умолчанию)
    let resolvedTeam = body.team ?? "CORE";
    try {
      const [meta] = await fetchEpicsMeta([key]);
      if (meta) {
        const retest = await fetchRetestPct(key).catch(() => 0);

        // Автодетект team: если все QA-назначенные — eQA-участники → eQA, иначе CORE
        if (meta.qaAccountIds.length > 0) {
          const memberRows = await sql`
            SELECT team FROM members
            WHERE jira_account_id = ANY(${meta.qaAccountIds})
          ` as Array<{ team: string }>;
          const teams = memberRows.map((m) => m.team);
          if (teams.length > 0 && teams.every((t) => t === "eQA")) resolvedTeam = "eQA";
          else if (teams.length > 0) resolvedTeam = "CORE";
        }

        await sql`
          INSERT INTO jira_cache (jira_key, title, jira_status, assignee_name, assignee_id, priority, retest_pct, issue_type, synced_at)
          VALUES (${key}, ${meta.title}, ${meta.jiraStatus}, ${meta.assigneeName}, ${meta.assigneeId}, ${meta.priority}, ${retest}, ${meta.issueType}, now())
          ON CONFLICT (jira_key) DO UPDATE SET
            title         = EXCLUDED.title,
            jira_status   = EXCLUDED.jira_status,
            assignee_name = EXCLUDED.assignee_name,
            assignee_id   = EXCLUDED.assignee_id,
            priority      = EXCLUDED.priority,
            retest_pct    = EXCLUDED.retest_pct,
            issue_type    = EXCLUDED.issue_type,
            synced_at     = now()
        `;
      }
    } catch {
      // Jira недоступна — не критично, данные появятся при следующем синке
    }

    const [row] = (await sql`
      INSERT INTO sprint_epics (sprint_id, jira_key, team, priority, goal, critbusiness, task)
      VALUES (
        ${body.sprintId}, ${key}, ${resolvedTeam},
        ${body.priority ?? 'none'}, ${body.goal ?? null},
        ${body.critbusiness ?? false}, ${body.task ?? false}
      )
      RETURNING id
    `) as Array<{ id: number }>;

    return NextResponse.json({ id: row.id });
  } catch (err) {
    // Уникальный ключ уже есть в этом спринте
    const msg = String(err);
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
      return NextResponse.json(
        { error: `${key} уже есть в этом спринте` },
        { status: 409 }
      );
    }
    return serverError("Не удалось добавить эпик");
  }
}
