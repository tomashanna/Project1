import { afterEach, describe, expect, it, vi } from "vitest";

import { extractBearerToken, HttpError, requireAdmin } from "@/lib/server/auth";

import { fakeSupabase, forgedToken, requestWithToken } from "./fakeSupabase";

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", email: "boss@example.com" };

async function expectStatus(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toBeInstanceOf(HttpError);
  await expect(promise).rejects.toMatchObject({ status });
}

afterEach(() => vi.unstubAllEnvs());

describe("extractBearerToken", () => {
  it("parses a bearer header case-insensitively", () => {
    expect(extractBearerToken(requestWithToken("abc.def.ghi"))).toBe("abc.def.ghi");
  });
  it("returns null when missing or malformed", () => {
    expect(extractBearerToken(requestWithToken())).toBeNull();
    const req = new Request("http://x", { headers: { authorization: "Basic abc" } });
    expect(extractBearerToken(req)).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("rejects requests without a token (401)", async () => {
    await expectStatus(requireAdmin(requestWithToken(), fakeSupabase({ user: ADMIN })), 401);
  });

  it("rejects a forged unsigned token even if it claims an admin email (401)", async () => {
    // Regression test: tokens used to be base64-decoded and trusted.
    const token = forgedToken({ email: ADMIN.email, sub: ADMIN.id });
    const supabase = fakeSupabase({ user: null }); // Supabase Auth rejects the signature
    await expectStatus(requireAdmin(requestWithToken(token), supabase), 401);
  });

  it("rejects verified users who are not admins (403)", async () => {
    const supabase = fakeSupabase({ user: { id: "u2", email: "c@x.com" }, role: "client" });
    await expectStatus(requireAdmin(requestWithToken("valid"), supabase), 403);
  });

  it("rejects users without a profile row (403)", async () => {
    const supabase = fakeSupabase({ user: { id: "u3" } });
    await expectStatus(requireAdmin(requestWithToken("valid"), supabase), 403);
  });

  it("surfaces profile lookup failures as 500, not as access", async () => {
    const supabase = fakeSupabase({ user: ADMIN, profileError: true });
    await expectStatus(requireAdmin(requestWithToken("valid"), supabase), 500);
  });

  it("accepts users whose profile role is admin", async () => {
    const supabase = fakeSupabase({ user: ADMIN, role: "admin" });
    const ctx = await requireAdmin(requestWithToken("valid"), supabase);
    expect(ctx.user.id).toBe(ADMIN.id);
  });

  describe("ADMIN_EMAILS break-glass allowlist", () => {
    it("accepts a verified, confirmed email listed in server env", async () => {
      vi.stubEnv("ADMIN_EMAILS", " Boss@Example.com , other@example.com");
      const user = { ...ADMIN, email_confirmed_at: "2026-01-01T00:00:00Z" };
      const ctx = await requireAdmin(requestWithToken("valid"), fakeSupabase({ user }));
      expect(ctx.user.email).toBe(ADMIN.email);
    });

    it("ignores the allowlist for unconfirmed emails", async () => {
      vi.stubEnv("ADMIN_EMAILS", ADMIN.email);
      const supabase = fakeSupabase({ user: ADMIN, role: "client" });
      await expectStatus(requireAdmin(requestWithToken("valid"), supabase), 403);
    });
  });
});
