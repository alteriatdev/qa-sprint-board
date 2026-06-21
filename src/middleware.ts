import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Защищаем все /admin/* кроме /admin/login
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const expected = process.env.ADMIN_TOKEN;
    const token = request.cookies.get("admin_token")?.value;
    // fail-closed: если токен в env не задан — никого не пускаем
    if (!expected || !token || token !== expected) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
