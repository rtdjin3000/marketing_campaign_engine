// List phone numbers with explicit marketing opt-in (whatsappEligible && hasOptIn),
// from APPROVED businesses, excluding opt-outs. These are the only SMS-eligible targets.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const businesses = await prisma.business.findMany({
    where: { validationStatus: "APPROVED" },
    include: { contacts: true },
  });
  const optOutPhones = new Set(
    (await prisma.optOut.findMany({ where: { channel: "WHATSAPP", phone: { not: null } } }))
      .map((r) => r.phone)
      .filter(Boolean),
  );

  const targets = [];
  for (const b of businesses) {
    const c = b.contacts.find(
      (x) => x.kind === "PHONE" && x.whatsappEligible && x.hasOptIn && x.normalizedValue,
    );
    if (!c) continue;
    if (optOutPhones.has(c.normalizedValue)) continue;
    targets.push({ businessId: b.id, name: b.name, source: b.source, phone: c.normalizedValue });
  }
  // Deduplicate by phone.
  const seen = new Set();
  const deduped = targets.filter((t) => (seen.has(t.phone) ? false : seen.add(t.phone)));
  console.log(JSON.stringify({ count: deduped.length, targets: deduped }, null, 2));
  await prisma.$disconnect();
})();
