// src/lib/auth.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function requireAdmin(_request?: Request): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function isAdmin(): Promise<boolean> {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false; // fail-closed: токен не сконфигурирован
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  return !!token && token === expected;
}
