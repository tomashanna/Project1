import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, HttpError, requireAdmin } from "@/lib/server/auth";

const LookupBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export async function POST(req: NextRequest) {
  try {
    const { admin } = await requireAdmin(req);

    const parsed = LookupBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Email inválido");
    const { email } = parsed.data;

    // auth.admin has no lookup-by-email; page through users until found.
    let found: { id: string; email?: string } | undefined;
    for (let page = 1; page <= MAX_PAGES && !found; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error) throw error;
      found = data.users.find((u) => u.email?.toLowerCase() === email);
      if (data.users.length < PAGE_SIZE) break;
    }
    if (!found) throw new HttpError(404, "No se encontró ningún usuario con ese email");

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", found.id)
      .maybeSingle();

    return NextResponse.json({
      userId: found.id,
      email: found.email,
      fullName: profile?.full_name ?? null,
      companyName: profile?.company_name ?? null,
    });
  } catch (err) {
    return errorResponse(err, "lookup-user");
  }
}
