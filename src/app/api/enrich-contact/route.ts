import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/rate-limit";
import { enrichBusinessContacts, enrichBusinessContactsBatch } from "@/lib/services";

const schema = z.union([
  z.object({
    businessId: z.string().min(1),
  }),
  z.object({
    businessIds: z.array(z.string().min(1)).min(1),
  }),
]);

export async function POST(request: NextRequest) {
  const rateLimit = await enforceRateLimit(`enrich:${request.headers.get("x-forwarded-for") ?? "local"}`);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const input = schema.parse(await request.json());
    const result = "businessIds" in input
      ? await enrichBusinessContactsBatch(input.businessIds)
      : await enrichBusinessContacts(input.businessId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to enrich contacts." },
      { status: 400 },
    );
  }
}
