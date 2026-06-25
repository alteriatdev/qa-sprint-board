// src/app/api/sprint/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseBody, badRequest, serverError, isNonEmptyString } from "@/lib/http";

// GET /api/sprint — список всех спринтов (от новых к старым)
export async function GET() {
  const rows = await sql`
    SELECT id, number, start_date::text AS start, end_date::text AS end,
           confluence_url AS "confluenceUrl", is_active AS "isActive"
    FROM sprints ORDER BY id DESC
  `;
  return NextResponse.json(rows);
}

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
    // Создаём неактивным — активацию делают явно через POST /api/sprint/:id/activate
    const [row] = (await sql`
      INSERT INTO sprints (number, start_date, end_date, confluence_url, is_active)
      VALUES (${body.number}, ${body.start}, ${body.end}, ${body.confluenceUrl ?? null}, false)
      RETURNING id
    `) as Array<{ id: number }>;

    return NextResponse.json({ id: row.id });
  } catch {
    return serverError("Не удалось создать спринт");
  }
}
