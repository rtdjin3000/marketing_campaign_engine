import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { SUBJECT_LINE_SUGGESTIONS } from "@/lib/constants";

const schema = z.object({
  restaurantName: z.string().min(2),
  offer: z.string().min(3),
  campaignContext: z.string().optional(),
  cuisine: z.string().optional(),
  audience: z.string().default("local businesses and office teams"),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());

    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ suggestions: SUBJECT_LINE_SUGGESTIONS, source: "fallback" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Generate exactly 5 concise email subject lines for a restaurant outreach campaign. Keep them compliant, business-focused, non-deceptive, and suitable for nearby commercial businesses. If campaignContext is provided, use it to shape the audience, tone, and positioning without inventing unsupported facts. Return plain JSON as {\"suggestions\":[string,...]} with no markdown.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(input),
              },
            ],
          },
        ],
        max_output_tokens: 220,
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      output_text?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "OpenAI subject generation failed.");
    }

    const rawText = payload.output_text ?? "";
    const parsed = JSON.parse(rawText) as { suggestions?: string[] };
    const suggestions = (parsed.suggestions ?? []).filter(Boolean).slice(0, 5);

    if (suggestions.length === 0) {
      throw new Error("OpenAI returned no subject suggestions.");
    }

    return NextResponse.json({ suggestions, source: env.OPENAI_MODEL });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate subject lines.",
        suggestions: SUBJECT_LINE_SUGGESTIONS,
        source: "fallback",
      },
      { status: 400 },
    );
  }
}
