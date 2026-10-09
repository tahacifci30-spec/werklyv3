import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Session } from "./types";
import { DEFAULT_COMPANY } from "./store";

/**
 * Tijdelijke sessie-laag (ondertekende cookie) met demo-gebruikers.
 * Vervang later door Supabase Auth: getSession() blijft dezelfde vorm houden.
 */
const COOKIE = "werkly_session";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-secret-change-me";
const PASSWORD = process.env.DEMO_PASSWORD ?? "werkly";

/**
 * In productie weigeren we inloggen zolang AUTH_SECRET en DEMO_PASSWORD niet zelf zijn ingesteld.
 * Anders zou een openbare site open staan met een bekend wachtwoord en een raadbaar cookie-geheim.
 */
export const AUTH_CONFIGURED =
  process.env.NODE_ENV !== "production" ||
  (!!process.env.AUTH_SECRET && !!process.env.DEMO_PASSWORD);

const USERS: Record<string, Session> = {
  "eigenaar@demo.nl": { name: "Eigenaar", role: "owner", company_id: DEFAULT_COMPANY },
  "monteur@demo.nl": { name: "Sven Bakker", role: "technician", company_id: DEFAULT_COMPANY },
};

export const DEMO_HINT = { password: PASSWORD, users: Object.keys(USERS) };

const sign = (v: string) => createHmac("sha256", SECRET).update(v).digest("base64url");

export function verifyLogin(email: string, password: string): Session | null {
  if (!AUTH_CONFIGURED) return null;
  const user = USERS[email.trim().toLowerCase()];
  if (!user) return null;
  const a = Buffer.from(password);
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return user;
}

export async function startSession(email: string) {
  const payload = Buffer.from(email.trim().toLowerCase()).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  if (!AUTH_CONFIGURED) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  return USERS[Buffer.from(payload, "base64url").toString()] ?? null;
}

export async function requireSession(role?: Role): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (role && s.role !== role) redirect(s.role === "owner" ? "/dashboard" : "/technician");
  return s;
}
