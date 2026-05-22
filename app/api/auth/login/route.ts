import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccount, accountExists } from "@/lib/users";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const acc = await verifyAccount(email, password);
  if (!acc) {
    const hint = (await accountExists(email))
      ? "Incorrect password."
      : "No account found for that email. Please sign up.";
    return NextResponse.json({ error: hint }, { status: 401 });
  }
  cookies().set(SESSION_COOKIE, signSession({ email: acc.email, name: acc.name }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true, name: acc.name, email: acc.email });
}
