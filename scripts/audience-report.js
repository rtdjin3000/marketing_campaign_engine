// One-off audience survey. Run with: node --env-file=.env scripts/audience-report.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const totalBusinesses = await prisma.business.count();
  const approved = await prisma.business.count({ where: { validationStatus: "APPROVED" } });
  const clover = await prisma.business.count({ where: { source: "clover" } });
  const cloverApproved = await prisma.business.count({
    where: { source: "clover", validationStatus: "APPROVED" },
  });
  const places = await prisma.business.count({
    where: { source: { not: "clover" }, validationStatus: "APPROVED" },
  });

  // Email-reachable approved businesses (generic email contact OR primaryEmail), minus opt-outs.
  const approvedBiz = await prisma.business.findMany({
    where: { validationStatus: "APPROVED" },
    include: { contacts: true },
  });
  const optOutEmails = new Set(
    (await prisma.optOut.findMany({ where: { channel: "EMAIL", email: { not: null } } }))
      .map((r) => r.email)
      .filter(Boolean),
  );
  const optOutPhones = new Set(
    (await prisma.optOut.findMany({ where: { channel: "WHATSAPP", phone: { not: null } } }))
      .map((r) => r.phone)
      .filter(Boolean),
  );

  let emailReach = 0;
  let emailClover = 0;
  let phoneReach = 0;
  let phoneClover = 0;
  let phoneMarketingAllowed = 0;

  for (const b of approvedBiz) {
    const emailContact = b.contacts.find((c) => c.kind === "EMAIL" && c.isGeneric);
    const emailDest = emailContact?.value || b.primaryEmail || "";
    if (emailDest && !optOutEmails.has(emailDest)) {
      emailReach += 1;
      if (b.source === "clover") emailClover += 1;
    }

    // Any phone we could SMS (normalized), regardless of WhatsApp opt-in.
    const phoneContact = b.contacts.find((c) => c.kind === "PHONE" && c.normalizedValue);
    const phoneDest = phoneContact?.normalizedValue || b.primaryPhone || "";
    if (phoneDest && !optOutPhones.has(phoneDest)) {
      phoneReach += 1;
      if (b.source === "clover") phoneClover += 1;
      const optedInPhone = b.contacts.find(
        (c) => c.kind === "PHONE" && c.whatsappEligible && c.hasOptIn,
      );
      if (optedInPhone) phoneMarketingAllowed += 1;
    }
  }

  console.log(JSON.stringify({
    totals: { totalBusinesses, approved, clover, cloverApproved, placesApproved: places },
    emailAudience: { reachable: emailReach, fromClover: emailClover, fromPlaces: emailReach - emailClover },
    phoneAudience: {
      reachable: phoneReach,
      fromClover: phoneClover,
      fromPlaces: phoneReach - phoneClover,
      withMarketingOptIn: phoneMarketingAllowed,
    },
    optOuts: { emails: optOutEmails.size, phones: optOutPhones.size },
  }, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
