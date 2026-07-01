import { DashboardClient } from "@/components/dashboard-client";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="panel rounded-[32px] p-6 md:p-8">
        <p className="eyebrow">Lead Discovery</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="title-display text-4xl font-semibold">Search nearby commercial businesses for outreach.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Discover approved local businesses within a 5 km radius, enrich public contact details from public pages only, and move leads through manual review before any message can be sent.
            </p>
          </div>
          <div className="rounded-[26px] bg-[#2c211b] px-5 py-4 text-sm text-[#f7efe4]">
            Search, validate, then launch.
          </div>
        </div>
      </section>

      <DashboardClient />
    </div>
  );
}
