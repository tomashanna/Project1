import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, HttpError, requireAdmin } from "@/lib/server/auth";

const InviteBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  full_name: z.string().trim().max(200).optional(),
  company_name: z.string().trim().max(200).optional(),
  template_id: z.number().int().positive().nullish(),
  section_ids: z.array(z.number().int().positive()).max(500).nullish(),
  role: z.enum(["client", "admin"]).default("client"),
});

export async function POST(req: NextRequest) {
  try {
    const { admin } = await requireAdmin(req);

    const parsed = InviteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Datos de invitación inválidos");
    const { email, full_name, company_name, template_id, section_ids, role } = parsed.data;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${siteUrl}/reset-password`,
        data: { full_name: full_name ?? null, company_name: company_name ?? null },
      },
    );
    if (inviteErr || !inviteData?.user) {
      throw new HttpError(400, "No se pudo enviar la invitación");
    }
    const newUserId = inviteData.user.id;

    // Role is written server-side with the service role; it is never taken
    // from user metadata, which the user can modify themselves.
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: newUserId,
        full_name: full_name ?? null,
        company_name: company_name ?? null,
        role,
        invited_at: new Date().toISOString(),
        template_id: template_id ?? null,
      },
      { onConflict: "id" },
    );
    if (profileErr) throw profileErr;

    if (role === "client" && template_id) {
      const { data: templateSections, error: tsErr } = await admin
        .from("template_sections")
        .select("section_id, custom_description, display_order")
        .eq("template_id", template_id);
      if (tsErr) throw tsErr;

      const rows = (templateSections ?? [])
        .filter((row) => !section_ids || section_ids.includes(row.section_id))
        .map((row) => ({
          client_id: newUserId,
          section_id: row.section_id,
          custom_description: row.custom_description,
          display_order: row.display_order,
        }));
      if (rows.length > 0) {
        const { error: insertErr } = await admin.from("client_sections").insert(rows);
        if (insertErr) throw insertErr;
      }
    }

    return NextResponse.json({ success: true, userId: newUserId });
  } catch (err) {
    return errorResponse(err, "invite");
  }
}
