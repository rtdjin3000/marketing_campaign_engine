import { prisma } from "@/lib/prisma";
import { LogsClient } from "@/components/logs-client";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      recipients: {
        orderBy: { createdAt: "desc" },
      },
      messageLogs: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return <LogsClient campaigns={campaigns} />;
}
