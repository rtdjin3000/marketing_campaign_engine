// Send the campaign MMS (poster + text) to opted-in phones only.
// Targets: APPROVED businesses with a PHONE contact that is whatsappEligible && hasOptIn,
// excluding opt-outs. Uses the local send-test-sms endpoint (Telnyx) with mms=true.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CAMPAIGN_ID = "cmpynrvv600000kdohimd2idf";
const BASE = "http://localhost:3000";

async function main() {
  const businesses = await prisma.business.findMany({
    where: { validationStatus: "APPROVED" },
    include: { contacts: true },
  });
  const optOutPhones = new Set(
    (await prisma.optOut.findMany({ where: { channel: "WHATSAPP", phone: { not: null } } }))
      .map((r) => r.phone)
      .filter(Boolean),
  );

  const seen = new Set();
  const targets = [];
  for (const b of businesses) {
    const c = b.contacts.find(
      (x) => x.kind === "PHONE" && x.whatsappEligible && x.hasOptIn && x.normalizedValue,
    );
    if (!c) continue;
    const phone = c.normalizedValue;
    if (optOutPhones.has(phone) || seen.has(phone)) continue;
    seen.add(phone);
    targets.push({ name: b.name, phone });
  }

  console.log(`Sending MMS to ${targets.length} opted-in recipients...\n`);

  const results = [];
  for (const t of targets) {
    try {
      const resp = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/send-test-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: t.phone, businessName: t.name, dryRun: false, mms: true }),
      });
      const data = await resp.json();
      const r = data.result ?? {};
      results.push({ phone: t.phone, status: r.status ?? "ERROR", providerId: r.providerId ?? null, error: r.error ?? data.error ?? null });
      console.log(`${t.phone}  ${r.status ?? "ERROR"}  ${r.providerId ?? r.error ?? data.error ?? ""}`);
    } catch (e) {
      results.push({ phone: t.phone, status: "ERROR", error: e.message });
      console.log(`${t.phone}  ERROR  ${e.message}`);
    }
    // Gentle pacing to avoid bursting the messaging profile.
    await new Promise((res) => setTimeout(res, 600));
  }

  const sent = results.filter((r) => r.status === "SENT").length;
  const failed = results.length - sent;
  console.log(`\nDone. SENT=${sent} FAILED/ERROR=${failed}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
