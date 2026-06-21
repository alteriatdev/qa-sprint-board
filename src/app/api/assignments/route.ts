// src/app/api/assignments/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, serverError, isNonEmptyString } from "@/lib/http";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const body = await parseBody<{
    sprintId: number; memberId: string; jiraKey: string; note?: string;
  }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");

  if (typeof body.sprintId !== "number") return badRequest("sprintId обязателен (число)");
  if (!isNonEmptyString(body.memberId)) return badRequest("memberId обязателен");
  if (!isNonEmptyString(body.jiraKey)) return badRequest("jiraKey обязателен");

  try {
    await sql`
      INSERT INTO assignments (sprint_id, member_id, jira_key, note)
      VALUES (${body.sprintId}, ${body.memberId}, ${body.jiraKey}, ${body.note ?? null})
      ON CONFLICT (sprint_id, member_id, jira_key) DO UPDATE SET note = EXCLUDED.note
    `;
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Не удалось создать назначение");
  }
}
