import { Channel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const schema = z.object({
  channel: z.nativeEnum(Channel),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  reason: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get("channel");
  const email = request.nextUrl.searchParams.get("email");
  const phone = request.nextUrl.searchParams.get("phone");

  try {
    const input = schema.parse({ channel, email, phone, reason: "unsubscribe_link" });
    await upsertOptOut(input);
    return new NextResponse("You have been unsubscribed.", { status: 200 });
  } catch {
    return new NextResponse("Unable to process opt-out request.", { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const record = await upsertOptOut(input);
    return NextResponse.json({ optOut: record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to opt out contact." },
      { status: 400 },
    );
  }
}

async function upsertOptOut(input: z.infer<typeof schema>) {
  const record = await prisma.optOut.upsert({
    where: input.email
      ? { channel_email: { channel: input.channel, email: input.email } }
      : { channel_phone: { channel: input.channel, phone: input.phone ?? "" } },
    update: {
      reason: input.reason,
      source: "opt_out_endpoint",
    },
    create: {
      channel: input.channel,
      email: input.email,
      phone: input.phone,
      reason: input.reason,
      source: "opt_out_endpoint",
    },
  });

  await prisma.campaignRecipient.updateMany({
    where:
      input.channel === Channel.EMAIL
        ? { channel: Channel.EMAIL, destination: input.email }
        : { channel: Channel.WHATSAPP, destination: input.phone },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  await prisma.messageLog.create({
    data: {
      channel: input.channel,
      destination: input.email ?? input.phone ?? "unknown",
      status: "UNSUBSCRIBED",
      provider: "system",
      metadata: JSON.stringify({ reason: input.reason ?? "user_request" }),
    },
  });

  return record;
}