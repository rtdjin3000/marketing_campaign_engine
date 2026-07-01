// Inventory of scraped contacts vs. reached, split by source (Places vs Clover).
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function uniq(arr) { return new Set(arr.filter(Boolean)); }

async function main() {
  const businesses = await prisma.business.findMany({ include: { contacts: true } });

  const emailSet = { places: new Set(), clover: new Set() };
  const phoneSet = { places: new Set(), clover: new Set() };

  for (const b of businesses) {
    const bucket = b.source === "clover" ? "clover" : "places";
    if (b.primaryEmail) emailSet[bucket].add(b.primaryEmail.toLowerCase());
    if (b.primaryPhone) phoneSet[bucket].add(b.primaryPhone);
    for (const c of b.contacts) {
      if (c.kind === "EMAIL" && c.value) emailSet[bucket].add(c.value.toLowerCase());
      if (c.kind === "PHONE" && (c.normalizedValue || c.value)) phoneSet[bucket].add(c.normalizedValue || c.value);
    }
  }

  // Reached = actual non-dry-run sends recorded in MessageLog.
  const emailSent = await prisma.messageLog.findMany({
    where: { channel: "EMAIL", status: "SENT" }, select: { destination: true },
  });
  const mmsSent = await prisma.messageLog.findMany({
    where: { provider: { contains: "sms" }, status: "SENT" }, select: { destination: true },
  });

  const report = {
    scraped: {
      emails: {
        total: emailSet.places.size + emailSet.clover.size,
        fromPlaces: emailSet.places.size,
        fromClover: emailSet.clover.size,
      },
      phones: {
        total: phoneSet.places.size + phoneSet.clover.size,
        fromPlaces: phoneSet.places.size,
        fromClover: phoneSet.clover.size,
      },
    },
    reached: {
      emailsSent: uniq(emailSent.map((r) => r.destination)).size,
      phonesSent_MMS: uniq(mmsSent.map((r) => r.destination)).size,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
