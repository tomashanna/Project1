import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, HttpError, requireAdmin } from "@/lib/server/auth";

const DeleteBody = z.object({ clientId: z.uuid() });

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    return errorResponse(err, "delete-client");
  }
  const { user, admin: supabaseAdmin } = ctx;

  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(new HttpError(400, "clientId inválido"), "delete-client");
  }
  const { clientId } = parsed.data;

  if (clientId === user.id) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 403 });
  }

  const { data: targetProfile, error: targetErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", clientId)
    .maybeSingle();
  if (targetErr) return errorResponse(targetErr, "delete-client");
  if (!targetProfile) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  if (targetProfile.role === "admin") {
    return NextResponse.json({ error: "No puedes eliminar un administrador" }, { status: 403 });
  }

  try {
    // ── Cascade delete ────────────────────────────────────────────

    const { data: projects } = await supabaseAdmin
      .from("client_projects")
      .select("id")
      .eq("client_id", clientId);

    for (const project of projects ?? []) {
      const { data: phases } = await supabaseAdmin
        .from("client_phases")
        .select("id")
        .eq("project_id", project.id);

      const phaseIds = (phases ?? []).map((p) => p.id);

      if (phaseIds.length > 0) {
        const { data: tasks } = await supabaseAdmin
          .from("client_tasks")
          .select("id")
          .in("phase_id", phaseIds);

        const taskIds = (tasks ?? []).map((t) => t.id);

        if (taskIds.length > 0) {
          const { data: questions } = await supabaseAdmin
            .from("task_questions")
            .select("id")
            .in("task_id", taskIds);

          const questionIds = (questions ?? []).map((q) => q.id);

          if (questionIds.length > 0) {
            await supabaseAdmin.from("task_files").delete().in("question_id", questionIds);
            await supabaseAdmin.from("task_responses").delete().in("question_id", questionIds);
          }

          await supabaseAdmin.from("task_questions").delete().in("task_id", taskIds);
          await supabaseAdmin.from("task_validations").delete().in("task_id", taskIds);
        }

        await supabaseAdmin.from("phase_files").delete().in("phase_id", phaseIds);
        await supabaseAdmin.from("client_tasks").delete().in("phase_id", phaseIds);
        await supabaseAdmin.from("client_phases").delete().eq("project_id", project.id);
      }

      await supabaseAdmin.from("client_projects").delete().eq("id", project.id);
    }

    // Legacy data
    await supabaseAdmin.from("submission_files").delete().eq("client_id", clientId);
    await supabaseAdmin.from("submissions").delete().eq("client_id", clientId);
    await supabaseAdmin.from("pipeline_items").delete().eq("client_id", clientId);
    await supabaseAdmin.from("client_sections").delete().eq("client_id", clientId);

    // Storage cleanup (best-effort). Files live in nested folders
    // ({clientId}/{sectionId|questionId|phases/...}/file), so walk the tree.
    try {
      const bucket = supabaseAdmin.storage.from("submissions");
      const paths: string[] = [];
      const queue = [clientId];
      while (queue.length > 0) {
        const prefix = queue.shift()!;
        const { data: entries, error: listErr } = await bucket.list(prefix, { limit: 1000 });
        if (listErr) throw listErr;
        for (const entry of entries ?? []) {
          const full = `${prefix}/${entry.name}`;
          // Folders have no id in Supabase Storage listings.
          if (entry.id) paths.push(full);
          else queue.push(full);
        }
      }
      for (let i = 0; i < paths.length; i += 1000) {
        await bucket.remove(paths.slice(i, i + 1000));
      }
    } catch (storageErr) {
      console.error("[delete-client] Storage cleanup error:", storageErr);
    }

    // Delete profile
    await supabaseAdmin.from("profiles").delete().eq("id", clientId);

    // Delete auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(clientId);
    if (authError) {
      console.error("[delete-client] Auth delete error:", authError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[delete-client] Error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el cliente." },
      { status: 500 }
    );
  }
}
