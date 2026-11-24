import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, HttpError, requireAdmin } from "@/lib/server/auth";
import {
  buildDepurePrompt,
  DEPURE_SYSTEM_PROMPT,
  MAX_RAW_TEXT_CHARS,
} from "@/lib/server/depurePrompt";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

const DepureBody = z.object({
  raw_text: z.string().trim().min(1, "No hay texto para depurar.").max(MAX_RAW_TEXT_CHARS),
  section_title: z.string().trim().min(1).max(300),
  section_description: z.string().trim().max(2_000).optional(),
  company_name: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new HttpError(503, "ANTHROPIC_API_KEY no está configurada en el servidor.");
    }

    const parsed = DepureBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((i) => i.code === "too_big");
      throw new HttpError(
        tooLong ? 413 : 400,
        tooLong
          ? `El texto supera el máximo de ${MAX_RAW_TEXT_CHARS.toLocaleString("es")} caracteres.`
          : "Datos inválidos para depurar.",
      );
    }

    const client = new Anthropic({ timeout: 90_000, maxRetries: 2 });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16_000,
      // Text cleanup is a simple task: low effort keeps latency and cost down.
      output_config: { effort: "low" },
      // If the model declines, the API retries on a fallback model server-side.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: DEPURE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildDepurePrompt(parsed.data) }],
    });

    if (response.stop_reason === "refusal") {
      throw new HttpError(422, "La IA no pudo procesar este texto.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new HttpError(422, "La respuesta de la IA quedó incompleta; divide el texto.");
    }

    const depuredText = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();

    return NextResponse.json({ depured_text: depuredText });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "La IA está saturada, intenta en un minuto." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[depure] Anthropic API error", err.status, err.message);
      return NextResponse.json({ error: "Error del servicio de IA." }, { status: 502 });
    }
    return errorResponse(err, "depure");
  }
}
