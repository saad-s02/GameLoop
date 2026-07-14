import { NextRequest, NextResponse } from "next/server";
import { AccessApiInputSchema } from "@/lib/planning/schemas";
import { signAccess } from "@/lib/server/access";

export async function POST(req: NextRequest) {
  const body = AccessApiInputSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false }, { status: 400 });
  if (body.data.code !== process.env.ACCESS_CODE) return NextResponse.json({ ok: false }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("gl_access", signAccess(body.data.code, process.env.ACCESS_COOKIE_SECRET!), {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/",
  });
  return res;
}
