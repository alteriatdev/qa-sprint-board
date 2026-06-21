// src/app/api/sprint/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, notFound, serverError } from "@/lib/http";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const rows = await sql`SELECT * FROM sprints WHERE id = ${id}`;
  if (rows.length === 0) return notFound("Спринт не найден");
  return NextResponse.json(rows[0]);
}

export async function PUT(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await parseBody<{
    number?: number; start?: string; end?: string;
    confluenceUrl?: string; isActive?: boolean;
  }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");

  try {
    const updated = (await sql`
      UPDATE sprints SET
        number         = COALESCE(${body.number ?? null}, number),
        start_date     = COALESCE(${body.start ?? null}, start_date),
        end_date       = COALESCE(${body.end ?? null}, end_date),
        confluence_url = COALESCE(${body.confluenceUrl ?? null}, confluence_url),
        is_active      = COALESCE(${body.isActive ?? null}, is_active)
      WHERE id = ${id}
      RETURNING id
    `) as Array<{ id: number }>;

    if (updated.length === 0) return notFound("Спринт не найден");
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Не удалось обновить спринт");
  }
}
