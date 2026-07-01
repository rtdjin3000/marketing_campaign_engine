const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const approved = await prisma.business.count({ where: { validationStatus: "APPROVED" } });
  const contacted = await prisma.business.count({ where: { validationStatus: "CONTACTED" } });
  const pending = await prisma.business.count({ where: { validationStatus: "PENDING_REVIEW" } });
  const rejected = await prisma.business.count({ where: { validationStatus: "REJECTED" } });
  console.log(JSON.stringify({ approved, contacted, pending, rejected }, null, 2));
  await prisma.$disconnect();
})();
