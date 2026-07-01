import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendCampaignTestSms } from "@/lib/services";

const schema = z.object({
  phone: z.string().min(8),
  businessName: z.string().optional(),
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
    const result = await sendCampaignTestSms({
      campaignId: id,
      phone: input.phone,
      businessName: input.businessName,
      dryRun: input.dryRun,
      mms: input.mms,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send test SMS." },
      { status: 400 },
    );
  }
}