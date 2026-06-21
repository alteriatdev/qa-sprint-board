import { NextResponse } from "next/server";

/** Парсит JSON-тело запроса. Возвращает null, если тело не валидный JSON. */
export async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "Internal error"): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** true, если значение — непустая строка. */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
