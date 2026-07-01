import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendCampaignTestEmail } from "@/lib/services";

const schema = z.object({
  email: z.string().email(),
  businessName: z.string().optional(),
  dryRun: z.boolean().default(true),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const result = await sendCampaignTestEmail({
      campaignId: id,
      email: input.email,
      businessName: input.businessName,
      dryRun: input.dryRun,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send test email." },
      { status: 400 },
    );
  }
}