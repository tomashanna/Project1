import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, forgedToken, requestWithToken } from "./fakeSupabase";

// Every route builds its service client through createClient; return a fake
// whose Auth server rejects the token, exactly like Supabase does for forgeries.
const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClientMock(...a) }));

const ROUTES = {
  invite: () => import("@/app/api/invite/route"),
  depure: () => import("@/app/api/depure/route"),
  lookupUser: () => import("@/app/api/admin/lookup-user/route"),
  deleteClient: () => import("@/app/api/admin/delete-client/route"),
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
  createClientMock.mockReturnValue(fakeSupabase({ user: null }));
});

describe.each(Object.entries(ROUTES))("POST /api/%s", (_name, load) => {
  it("returns 401 for a forged admin token", async () => {
    const { POST } = await load();
    const token = forgedToken({ email: "boss@example.com", role: "admin" });
    const res = await POST(requestWithToken(token, { email: "x@y.com" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 without a token", async () => {
    const { POST } = await load();
    const res = await POST(requestWithToken(undefined, {}) as never);
    expect(res.status).toBe(401);
  });

  it("returns 503 when the service role key is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST } = await load();
    const res = await POST(requestWithToken("t", {}) as never);
    expect(res.status).toBe(503);
  });
});

describe("POST /api/depure input validation", () => {
  beforeEach(() => {
    createClientMock.mockReturnValue(
      fakeSupabase({ user: { id: "a" }, role: "admin" }),
    );
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  it("rejects empty text with 400 before calling the model", async () => {
    const { POST } = await ROUTES.depure();
    const res = await POST(requestWithToken("t", { raw_text: "  ", section_title: "S" }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects oversized text with 413", async () => {
    const { POST } = await ROUTES.depure();
    const body = { raw_text: "a".repeat(40_001), section_title: "S" };
    const res = await POST(requestWithToken("t", body) as never);
    expect(res.status).toBe(413);
  });
});
