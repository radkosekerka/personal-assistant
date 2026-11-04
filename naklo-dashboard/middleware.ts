import { NextResponse } from "next/server";
import { auth, authDisabled, isAllowedEmail } from "@/auth";

export default auth((req) => {
  if (authDisabled()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth") || pathname === "/prihlaseni") return NextResponse.next();
  if (!isAllowedEmail(req.auth?.user?.email)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/prihlaseni", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
