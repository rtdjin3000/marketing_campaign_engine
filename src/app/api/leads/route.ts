import { NextRequest, NextResponse } from "next/server";
import { ValidationStatus } from "@prisma/client";

import { getLeadRows } from "@/lib/services";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const leads = await getLeadRows({
    hasEmail: params.get("hasEmail") === "true",
    hasPhone: params.get("hasPhone") === "true",
    category: params.get("category") ?? undefined,
    validationStatus: (params.get("validationStatus") as ValidationStatus | null) ?? undefined,
  });
  return NextResponse.json({ leads });
}
