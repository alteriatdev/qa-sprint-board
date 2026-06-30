// src/app/api/epics/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, notFound, serverError } from "@/lib/http";

interface Params { params: Promise<{ id: string }> }

// PUT /api/epics/:id — обновить флаги, goal, firstPass (только из adminки)
export async function PUT(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await parseBody<{
    goal?: string; priority?: string; critbusiness?: boolean;
    task?: boolean; goalDone?: boolean; firstPass?: number; updatedBy?: string;
    firstPassEnabled?: boolean; retestEnabled?: boolean; smokesEnabled?: boolean;
    firstPassDone?: boolean; retestDone?: boolean; smokesDone?: boolean;
  }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");

  if (
    body.firstPass !== undefined &&
    (typeof body.firstPass !== "number" || body.firstPass < 0 || body.firstPass > 100)
  ) {
    return badRequest("firstPass должен быть числом 0..100");
  }

  try {
    const updated = (await sql`
      UPDATE sprint_epics SET
        goal               = COALESCE(${body.goal ?? null}, goal),
        priority           = COALESCE(${body.priority ?? null}, priority),
        critbusiness       = COALESCE(${body.critbusiness ?? null}, critbusiness),
        task               = COALESCE(${body.task ?? null}, task),
        goal_done          = COALESCE(${body.goalDone ?? null}, goal_done),
        first_pass_enabled = COALESCE(${body.firstPassEnabled ?? null}, first_pass_enabled),
        retest_enabled     = COALESCE(${body.retestEnabled ?? null}, retest_enabled),
        smokes_enabled     = COALESCE(${body.smokesEnabled ?? null}, smokes_enabled),
        first_pass_done    = COALESCE(${body.firstPassDone ?? null}, first_pass_done),
        retest_done        = COALESCE(${body.retestDone ?? null}, retest_done),
        smokes_done        = COALESCE(${body.smokesDone ?? null}, smokes_done)
      WHERE id = ${id}
      RETURNING sprint_id, jira_key
    `) as Array<{ sprint_id: number; jira_key: string }>;

    if (updated.length === 0) return notFound("Эпик не найден");

    if (body.firstPass !== undefined) {
      const { sprint_id, jira_key } = updated[0];
      await sql`
        INSERT INTO progress_entries (sprint_id, jira_key, first_pass, updated_at, updated_by)
        VALUES (${sprint_id}, ${jira_key}, ${body.firstPass}, now(), ${body.updatedBy ?? 'admin'})
        ON CONFLICT (sprint_id, jira_key) DO UPDATE SET
          first_pass = EXCLUDED.first_pass,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      `;
    }

    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Не удалось обновить эпик");
  }
}


// DELETE /api/epics/:id
export async function DELETE(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    const deleted = (await sql`
      DELETE FROM sprint_epics WHERE id = ${id}
      RETURNING sprint_id, jira_key
    `) as Array<{ sprint_id: number; jira_key: string }>;

    if (deleted.length === 0) return notFound("Эпик не найден");

    // Чистим осиротевший прогресс этого эпика в этом спринте
    const { sprint_id, jira_key } = deleted[0];
    await sql`
      DELETE FROM progress_entries WHERE sprint_id = ${sprint_id} AND jira_key = ${jira_key}
    `;

    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Не удалось удалить эпик");
  }
}
