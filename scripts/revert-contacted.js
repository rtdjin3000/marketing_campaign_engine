// Revert businesses wrongly flipped to CONTACTED by the dry-run, back to APPROVED.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const res = await prisma.business.updateMany({
    where: { validationStatus: "CONTACTED" },
    data: { validationStatus: "APPROVED" },
  });
  const approved = await prisma.business.count({ where: { validationStatus: "APPROVED" } });
  const contacted = await prisma.business.count({ where: { validationStatus: "CONTACTED" } });
  console.log(JSON.stringify({ reverted: res.count, approved, contacted }, null, 2));
  await prisma.$disconnect();
})();
