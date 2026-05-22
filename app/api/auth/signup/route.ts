import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAccount } from "@/lib/users";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const acc = await createAccount(body.name ?? "", body.email ?? "", body.password ?? "");
    cookies().set(SESSION_COOKIE, signSession({ email: acc.email, name: acc.name }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.json({ ok: true, name: acc.name, email: acc.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign up failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
