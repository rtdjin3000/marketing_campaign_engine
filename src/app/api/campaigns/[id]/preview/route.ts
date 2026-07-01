import { NextRequest, NextResponse } from "next/server";

import { previewCampaign } from "@/lib/services";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const preview = await previewCampaign(id);
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to preview campaign." },
      { status: 400 },
    );
  }
}
