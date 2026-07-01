import { NextResponse } from "next/server";

import { importCloverCustomers } from "@/lib/clover";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await importCloverCustomers();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clover import failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
