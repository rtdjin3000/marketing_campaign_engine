import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/services";

const schema = z.object({
  query: z.string().min(3),
  placeId: z.string().optional(),
  radiusKm: z.coerce.number().min(1).max(15).default(5),
});

export async function POST(request: NextRequest) {
  const rateLimit = await enforceRateLimit(`geocode:${request.headers.get("x-forwarded-for") ?? "local"}`);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const input = schema.parse(await request.json());
    const result = await geocodeAddress(input.query, input.placeId);
    const location = await prisma.location.create({
      data: {
        label: result.formattedAddress,
        query: input.query,
        latitude: result.latitude,
        longitude: result.longitude,
        radiusKm: input.radiusKm,
        source: result.source,
      },
    });

    return NextResponse.json({
      locationId: location.id,
      formattedAddress: result.formattedAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      radiusKm: input.radiusKm,
      source: result.source,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to geocode location." },
      { status: 400 },
    );
  }
}
