// src/app/api/epics/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, serverError, isNonEmptyString } from "@/lib/http";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const body = await parseBody<{
    sprintId: number; jiraKey: string; team: string;
    priority?: string; goal?: string; critbusiness?: boolean;
    bonus?: boolean; task?: boolean;
  }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");

  if (typeof body.sprintId !== "number") return badRequest("sprintId обязателен (число)");
  if (!isNonEmptyString(body.jiraKey)) return badRequest("jiraKey обязателен");
  if (!isNonEmptyString(body.team)) return badRequest("team обязателен");

  try {
    const [row] = (await sql`
      INSERT INTO sprint_epics (sprint_id, jira_key, team, priority, goal, critbusiness, bonus, task)
      VALUES (
        ${body.sprintId}, ${body.jiraKey}, ${body.team},
        ${body.priority ?? 'none'}, ${body.goal ?? null},
        ${body.critbusiness ?? false}, ${body.bonus ?? false}, ${body.task ?? false}
      )
      RETURNING id
    `) as Array<{ id: number }>;

    return NextResponse.json({ id: row.id });
  } catch {
    return serverError("Не удалось добавить эпик");
  }
}
