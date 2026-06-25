// src/app/api/sprint/[id]/activate/route.ts
// POST /api/sprint/:id/activate — атомарно деактивирует текущий, активирует выбранный.
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { notFound, serverError } from "@/lib/http";

interface Params { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;

  try {
    const updated = (await sql`
      WITH deactivated AS (
        UPDATE sprints SET is_active = false WHERE is_active = true
      )
      UPDATE sprints SET is_active = true WHERE id = ${id}
      RETURNING id
    `) as Array<{ id: number }>;

    if (updated.length === 0) return notFound("Спринт не найден");
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Не удалось активировать спринт");
  }
}
