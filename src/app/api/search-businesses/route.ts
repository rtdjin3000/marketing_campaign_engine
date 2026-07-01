import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { discoverBusinesses, enrichBusinessContactsBatch } from "@/lib/services";

const schema = z.object({
  locationId: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  radiusKm: z.number().min(1).max(15),
});

export async function POST(request: NextRequest) {
  const rateLimit = await enforceRateLimit(`search:${request.headers.get("x-forwarded-for") ?? "local"}`);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const input = schema.parse(await request.json());
    const location = await prisma.location.findUnique({ where: { id: input.locationId } });
    if (!location) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    const businesses = await discoverBusinesses(input);
    const websiteBusinessIds = businesses
      .filter((business) => Boolean(business.websiteUrl))
      .map((business) => business.id);

    const enrichment = websiteBusinessIds.length
      ? await enrichBusinessContactsBatch(websiteBusinessIds)
      : {
          processed: 0,
          enriched: 0,
          createdContacts: 0,
          results: [],
        };

    return NextResponse.json({ count: businesses.length, businesses, enrichment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to search businesses." },
      { status: 400 },
    );
  }
}
