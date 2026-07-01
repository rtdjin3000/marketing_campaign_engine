import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// Serves a campaign poster as a public image so MMS providers (Telnyx/Twilio)
// can fetch it. Base64 data URLs are decoded and streamed; already-public
// http(s) posters are redirected. Note: for providers to reach this, the app
// must be deployed (or tunnelled) at a public APP_BASE_URL.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { posterImageUrl: true },
  });

  const poster = campaign?.posterImageUrl;
  if (!poster) {
    return NextResponse.json({ error: "No poster for this campaign." }, { status: 404 });
  }

  const dataUrlMatch = poster.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const [, contentType, base64Payload] = dataUrlMatch;
    const buffer = Buffer.from(base64Payload, "base64");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  try {
    const parsed = new URL(poster);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return NextResponse.redirect(poster);
    }
  } catch {
    // fall through to error below
  }

  return NextResponse.json({ error: "Unsupported poster format." }, { status: 415 });
}
