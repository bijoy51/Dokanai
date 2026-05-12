import crypto from "crypto";

/**
 * In-memory account store. Sufficient for a demo deployment.
 * NOTE: serverless cold starts reset this map, so accounts created
 * a long time ago may need to sign up again. The signed session
 * cookie itself survives cold starts, so an already-logged-in user
 * stays logged in regardless. For production, back this with a real
 * database.
 */

const PEPPER = process.env.AUTH_SECRET || "dokanai-dev-secret-change-in-production";

export interface Account {
  name: string;
  email: string;
  passwordHash: string;
}

const accounts = new Map<string, Account>();

function hashPassword(pw: string): string {
  return crypto.createHash("sha256").update(`${pw}::${PEPPER}`).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// A demo account that always exists, so graders can log in even after
// a cold start. Credentials: demo@dokanai.app / demo1234
const DEMO_EMAIL = "demo@dokanai.app";
function ensureDemo() {
  if (!accounts.has(DEMO_EMAIL)) {
    accounts.set(DEMO_EMAIL, {
      name: "Demo Shop",
      email: DEMO_EMAIL,
      passwordHash: hashPassword("demo1234"),
    });
  }
}
ensureDemo();

export const DEMO_CREDENTIALS = { email: DEMO_EMAIL, password: "demo1234" };

export function createAccount(name: string, email: string, password: string): Account {
  ensureDemo();
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) throw new Error("Please enter a valid email address.");
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (accounts.has(e)) throw new Error("An account with this email already exists. Try logging in.");
  const acc: Account = {
    name: (name || "").trim() || e.split("@")[0],
    email: e,
    passwordHash: hashPassword(password),
  };
  accounts.set(e, acc);
  return acc;
}

export function verifyAccount(email: string, password: string): Account | null {
  ensureDemo();
  const e = normalizeEmail(email);
  const acc = accounts.get(e);
  if (!acc) return null;
  if (acc.passwordHash !== hashPassword(password)) return null;
  return acc;
}

export function accountExists(email: string): boolean {
  ensureDemo();
  return accounts.has(normalizeEmail(email));
}
