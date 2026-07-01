import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendCampaignSms } from "@/lib/services";

const schema = z.object({
  dryRun: z.boolean().default(true),
  mms: z.boolean().default(false),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const results = await sendCampaignSms(id, input.dryRun, input.mms);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send SMS campaign." },
      { status: 400 },
    );
  }
}
