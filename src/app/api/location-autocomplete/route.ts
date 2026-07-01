import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/rate-limit";
import { getLocationAutocompleteSuggestions } from "@/lib/services";

const schema = z.object({
  query: z.string().min(2),
});

export async function POST(request: NextRequest) {
  const rateLimit = await enforceRateLimit(`autocomplete:${request.headers.get("x-forwarded-for") ?? "local"}`);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const input = schema.parse(await request.json());
    const suggestions = await getLocationAutocompleteSuggestions(input.query);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch location suggestions." },
      { status: 400 },
    );
  }
}