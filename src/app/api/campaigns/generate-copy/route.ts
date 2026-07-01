import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SUBJECT_LINE_SUGGESTIONS } from "@/lib/constants";
import { env } from "@/lib/env";

const schema = z.object({
  restaurantName: z.string().min(2),
  restaurantAddress: z.string().min(3),
  restaurantPhone: z.string().min(6),
  restaurantWebsite: z.string().optional(),
  offer: z.string().min(3),
  campaignContext: z.string().optional(),
  audience: z.string().default("local businesses and office teams"),
  cuisine: z.string().default("Indian"),
});

function buildFallbackCopy(input: z.infer<typeof schema>) {
  return {
    emailSubject: SUBJECT_LINE_SUGGESTIONS[0],
    emailBody:
      `Hi {{business_name}},\n\n${input.restaurantName} is reaching out to nearby businesses with a fresh ${input.cuisine.toLowerCase()} food offer for teams. {{offer}}. We can arrange office lunches, staff meals, or small catering orders near ${input.restaurantAddress}.\n\nIf this is relevant for your team, reply to this email or call {{phone}}.\n\nOrder link: {{order_link}}`,
    whatsappBody:
      `${input.restaurantName}: {{offer}}. Call {{phone}} or order {{order_link}}.`,
    source: "fallback",
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.json().catch(() => ({}));
  const fallbackInput = schema.safeParse(rawBody);

  try {
    const input = schema.parse(rawBody);

    if (!env.OPENAI_API_KEY) {
      return NextResponse.json(buildFallbackCopy(input));
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
                  "Generate outreach copy for a restaurant promotion campaign. Return strict JSON only with keys emailSubject, emailBody, whatsappBody. Keep it compliant and non-deceptive. Do not mention WhatsApp opt-in in the copy itself. Preserve the template variables {{business_name}}, {{offer}}, {{phone}}, and {{order_link}} where relevant. Email body should be concise, professional, and suitable for nearby commercial businesses. WhatsApp body must be a very short plain-text offer message, ideally one sentence and under 180 characters. If campaignContext is provided, use it as a high-priority constraint for audience, differentiators, tone, geography, and positioning, but do not invent unsupported facts.",
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
        max_output_tokens: 420,
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      output_text?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "OpenAI copy generation failed.");
    }

    const parsed = JSON.parse(payload.output_text ?? "{}") as {
      emailSubject?: string;
      emailBody?: string;
      whatsappBody?: string;
    };

    if (!parsed.emailSubject || !parsed.emailBody || !parsed.whatsappBody) {
      throw new Error("OpenAI returned incomplete campaign copy.");
    }

    return NextResponse.json({
      emailSubject: parsed.emailSubject,
      emailBody: parsed.emailBody,
      whatsappBody: parsed.whatsappBody,
      source: env.OPENAI_MODEL,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate campaign copy.",
        ...(fallbackInput.success ? buildFallbackCopy(fallbackInput.data) : buildFallbackCopy({
          restaurantName: "Spice Route Kitchen",
          restaurantAddress: "12 Market Street",
          restaurantPhone: "+1 555-0123",
          restaurantWebsite: "https://example-restaurant.com/order",
          offer: "15% off first office catering order before Friday",
          campaignContext: "",
          audience: "local businesses and office teams",
          cuisine: "Indian",
        })),
      },
      { status: 400 },
    );
  }
}