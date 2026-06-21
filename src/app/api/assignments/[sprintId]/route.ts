// src/app/api/assignments/[sprintId]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, serverError, isNonEmptyString } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ sprintId: string }> }) {
  const { sprintId } = await params;
  const rows = await sql`
    SELECT id, sprint_id, member_id, jira_key, note
    FROM assignments WHERE sprint_id = ${sprintId}
  `;
  return NextResponse.json(rows);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sprintId: string }> }) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { sprintId } = await params;
  const body = await parseBody<{ memberId: string; jiraKey: string }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");
  if (!isNonEmptyString(body.memberId)) return badRequest("memberId обязателен");
  if (!isNonEmptyString(body.jiraKey)) return badRequest("jiraKey обязателен");

  try {
    await sql`
      DELETE FROM assignments
      WHERE sprint_id = ${sprintId} AND member_id = ${body.memberId} AND jira_key = ${body.jiraKey}
    `;
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Не удалось удалить назначение");
  }
}
