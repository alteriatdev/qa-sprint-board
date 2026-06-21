import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// Лимит хранилища Neon free-tier: 0.5 GB. Можно переопределить через env.
const DEFAULT_LIMIT_BYTES = 512 * 1024 * 1024;

export async function GET(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const rows = (await sql`
      SELECT pg_database_size(current_database())::float8 AS bytes
    `) as Array<{ bytes: number }>;

    const usedBytes = rows[0]?.bytes ?? 0;
    const limitBytes = process.env.DB_SIZE_LIMIT_BYTES
      ? Number(process.env.DB_SIZE_LIMIT_BYTES)
      : DEFAULT_LIMIT_BYTES;

    return NextResponse.json({ usedBytes, limitBytes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB stats failed" },
      { status: 500 },
    );
  }
}
