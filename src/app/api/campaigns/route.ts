import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

function isPosterImageValue(value: string | undefined) {
  if (!value) {
    return true;
  }

  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)) {
    return true;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const schema = z.object({
  name: z.string().min(3),
  emailSubject: z.string().min(3),
  emailBody: z.string().min(10),
  whatsappBody: z.string().min(10),
  posterImageUrl: z.string().optional().or(z.literal("")).refine(isPosterImageValue, "Poster must be an image URL or uploaded image."),
  posterImageName: z.string().optional().or(z.literal("")),
  offer: z.string().optional(),
  offerExpiryDate: z.string().optional(),
  restaurantName: z.string().min(2),
  restaurantAddress: z.string().min(3),
  restaurantPhone: z.string().min(6),
  restaurantWebsite: z.string().url().optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const campaign = await prisma.campaign.create({
      data: {
        name: input.name,
        emailSubject: input.emailSubject,
        emailBody: input.emailBody,
        whatsappBody: input.whatsappBody,
        posterImageUrl: input.posterImageUrl || null,
        posterImageName: input.posterImageName || null,
        offer: input.offer,
        offerExpiryDate: input.offerExpiryDate ? new Date(input.offerExpiryDate) : null,
        restaurantName: input.restaurantName,
        restaurantAddress: input.restaurantAddress,
        restaurantPhone: input.restaurantPhone,
        restaurantWebsite: input.restaurantWebsite || null,
      },
    });
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create campaign." },
      { status: 400 },
    );
  }
}

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      recipients: true,
      messageLogs: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ campaigns });
}
