import type { SupabaseClient } from "@supabase/supabase-js";

interface FakeOptions {
  /** Result of auth.getUser(token). `null` simulates an invalid/forged token. */
  user: { id: string; email?: string; email_confirmed_at?: string } | null;
  /** Role stored in profiles for that user (undefined = no profile row). */
  role?: string;
  profileError?: boolean;
}

/** Minimal stand-in for the service-role client used by requireAdmin. */
export function fakeSupabase({ user, role, profileError }: FakeOptions) {
  const getUser = async (token: string) => {
    void token;
    return user
      ? { data: { user }, error: null }
      : { data: { user: null }, error: { message: "invalid JWT" } };
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () =>
      profileError
        ? { data: null, error: { message: "boom" } }
        : { data: role === undefined ? null : { role }, error: null },
  };
  return {
    auth: { getUser },
    from: () => query,
  } as unknown as SupabaseClient;
}

export function requestWithToken(token?: string, body: unknown = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** An unsigned token whose payload claims to be an admin. */
export function forgedToken(claims: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.x`;
}
