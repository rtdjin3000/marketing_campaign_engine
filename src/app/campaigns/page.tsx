import { CampaignsClient } from "@/components/campaigns-client";

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <section className="panel rounded-[32px] p-6 md:p-8">
        <p className="eyebrow">Campaign Builder</p>
        <h2 className="title-display mt-3 text-4xl font-semibold">Build, preview, and launch promotions with human approval gates.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Approved leads only. Email includes unsubscribe handling. WhatsApp stays limited to eligible recipients with opt-in or a prior business relationship.
        </p>
      </section>

      <CampaignsClient />
    </div>
  );
}
