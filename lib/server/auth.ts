import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Server-side authorization helpers for API routes.
 *
 * Every privileged route MUST call `requireAdmin` before doing any work. The
 * caller's access token is verified by Supabase Auth (signature, expiry and
 * session revocation) — never decode a JWT by hand and trust its claims.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface AdminContext {
  user: User;
  /** Service-role client. Bypasses RLS — only use after authorization. */
  admin: SupabaseClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(503, `Server misconfigured: ${name} is not set`);
  return value;
}

/** Service-role Supabase client. Bypasses RLS; never expose to the browser. */
export function createServiceClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Optional break-glass allowlist, configured only via server env
 * (`ADMIN_EMAILS=a@x.com,b@y.com`). Matched against the *verified* email of
 * a user with a confirmed address — never against client-supplied claims.
 */
function envAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAdmin(
  req: Request,
  admin: SupabaseClient = createServiceClient(),
): Promise<AdminContext> {
  const token = extractBearerToken(req);
  if (!token) throw new HttpError(401, "No autorizado");

  // Verifies signature + expiry against Supabase Auth.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "No autorizado");
  const user = data.user;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new HttpError(500, "No se pudo verificar el rol");

  const email = user.email?.toLowerCase();
  const isAllowlisted = Boolean(email && user.email_confirmed_at && envAdminEmails().has(email));

  if (profile?.role !== "admin" && !isAllowlisted) {
    throw new HttpError(403, "Solo administradores");
  }
  return { user, admin };
}

/** Converts thrown errors into JSON responses without leaking internals. */
export function errorResponse(err: unknown, route: string): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`[${route}]`, err);
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}
