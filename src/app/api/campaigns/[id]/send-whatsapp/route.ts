import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendCampaignWhatsApp } from "@/lib/services";

const schema = z.object({
  dryRun: z.boolean().default(true),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const results = await sendCampaignWhatsApp(id, input.dryRun);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send WhatsApp campaign." },
      { status: 400 },
    );
  }
}
