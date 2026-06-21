// src/app/api/sprint/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, serverError, isNonEmptyString } from "@/lib/http";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const body = await parseBody<{
    number: number; start: string; end: string; confluenceUrl?: string;
  }>(request);
  if (!body) return badRequest("Невалидный JSON в теле запроса");

  if (typeof body.number !== "number") return badRequest("number обязателен (число)");
  if (!isNonEmptyString(body.start)) return badRequest("start обязателен (дата)");
  if (!isNonEmptyString(body.end)) return badRequest("end обязателен (дата)");

  try {
    // Деактивация прошлого + вставка нового — одним statement (атомарно)
    const [row] = (await sql`
      WITH deactivated AS (
        UPDATE sprints SET is_active = false WHERE is_active = true RETURNING id
      )
      INSERT INTO sprints (number, start_date, end_date, confluence_url, is_active)
      VALUES (${body.number}, ${body.start}, ${body.end}, ${body.confluenceUrl ?? null}, true)
      RETURNING id
    `) as Array<{ id: number }>;

    return NextResponse.json({ id: row.id });
  } catch {
    return serverError("Не удалось создать спринт");
  }
}
