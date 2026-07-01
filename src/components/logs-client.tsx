type CampaignLog = {
  id: string;
  name: string;
  status: string;
  lastSentAt?: string | Date | null;
  recipients: Array<{
    id: string;
    channel: string;
    status: string;
    destination: string;
    dryRun: boolean;
    sentAt?: string | Date | null;
  }>;
  messageLogs: Array<{
    id: string;
    channel: string;
    status: string;
    provider: string;
    destination: string;
    createdAt: string | Date;
    error?: string | null;
  }>;
};

export function LogsClient({ campaigns }: { campaigns: CampaignLog[] }) {
  return (
    <div className="space-y-6">
      <section className="panel rounded-[28px] p-6">
        <p className="eyebrow">Logs & Analytics</p>
        <h2 className="title-display mt-2 text-3xl font-semibold">Campaign execution audit trail</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Every launch creates recipient status rows and provider logs. Dry-runs stay visible so the final send can be reviewed before production outreach.
        </p>
      </section>

      {campaigns.map((campaign) => (
        <section key={campaign.id} className="panel rounded-[28px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="title-display text-2xl font-semibold">{campaign.name}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Status {campaign.status}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--muted)]">
              Last sent {campaign.lastSentAt ? new Date(campaign.lastSentAt).toLocaleString() : "Not sent"}
            </div>
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            <div className="rounded-[24px] bg-white/80 p-4">
              <p className="font-semibold">Recipient statuses</p>
              <div className="mt-3 space-y-3">
                {campaign.recipients.map((recipient) => (
                  <div key={recipient.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] px-4 py-3 text-sm">
                    <div>
                      <p>{recipient.destination}</p>
                      <p className="text-[var(--muted)]">{recipient.channel}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{recipient.status}</p>
                      <p className="text-[var(--muted)]">{recipient.dryRun ? "Dry run" : "Live"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] bg-white/80 p-4">
              <p className="font-semibold">Provider logs</p>
              <div className="mt-3 space-y-3">
                {campaign.messageLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-[var(--stroke)] px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{log.destination}</p>
                      <span>{log.status}</span>
                    </div>
                    <p className="mt-1 text-[var(--muted)]">
                      {log.channel} via {log.provider} at {new Date(log.createdAt).toLocaleString()}
                    </p>
                    {log.error ? <p className="mt-2 text-[var(--danger)]">{log.error}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
