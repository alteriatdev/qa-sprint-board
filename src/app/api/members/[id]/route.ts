// src/app/api/members/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, notFound, serverError } from "@/lib/http";

interface Params { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await parseBody<{
    name?: string; role?: string; shift?: string;
  }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");

  try {
    const updated = (await sql`
      UPDATE members SET
        name  = COALESCE(${body.name ?? null}, name),
        role  = COALESCE(${body.role ?? null}, role),
        shift = COALESCE(${body.shift ?? null}, shift)
      WHERE id = ${id}
      RETURNING id
    `) as Array<{ id: string }>;

    if (updated.length === 0) return notFound("Участник не найден");
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Не удалось обновить участника");
  }
}
