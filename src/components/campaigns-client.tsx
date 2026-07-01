"use client";

import type React from "react";
import { useEffect, useState } from "react";

import { SUBJECT_LINE_SUGGESTIONS, TEMPLATE_VARIABLES } from "@/lib/constants";
import { renderTemplate } from "@/lib/utils";

type Campaign = {
  id: string;
  name: string;
  emailSubject: string;
  restaurantName: string;
  status: string;
  lastPreviewedAt?: string | null;
  lastSentAt?: string | null;
  recipients: Array<{ id: string; channel: string; status: string }>;
  messageLogs: Array<{ id: string; channel: string; status: string; destination: string; createdAt: string }>;
};

type Preview = {
  campaign: { id: string; name: string };
  emailRecipients: Array<{ destination: string }>;
  whatsappRecipients: Array<{ destination: string }>;
  complianceChecklist: Array<{ label: string; passed: boolean }>;
  emailPreview: { subject: string; body: string; posterImageUrl?: string | null };
  whatsappPreview: string;
};

const defaultForm = {
  name: "Fresh Indian Lunch Outreach",
  emailSubject: SUBJECT_LINE_SUGGESTIONS[0],
  emailBody:
    "Hi {{business_name}},\n\n{{restaurant_name}} has a fresh Indian lunch offer for nearby teams. {{offer}}. We would love to serve your office at {{address}}. Reply or call {{phone}}.\n\nOrder link: {{order_link}}",
  whatsappBody:
    "{{restaurant_name}}: {{offer}}. Call {{phone}} or order {{order_link}}.",
  campaignContext:
    "Target offices, clinics, and retail teams within 5 km. Emphasize fast weekday lunch delivery, vegetarian options, and easy group ordering.",
  posterImageUrl: "",
  posterImageName: "",
  offer: "15% off first office catering order before Friday",
  offerExpiryDate: "",
  restaurantName: "Spice Route Kitchen",
  restaurantAddress: "12 Market Street",
  restaurantPhone: "+1 555-0123",
  restaurantWebsite: "https://example-restaurant.com/order",
};

export function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>(SUBJECT_LINE_SUGGESTIONS);
  const [isGeneratingSubjects, setIsGeneratingSubjects] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [isSendingTestSms, setIsSendingTestSms] = useState(false);
  const [mms, setMms] = useState(false);
  const [isLaunchingSms, setIsLaunchingSms] = useState(false);
  const [posterImageUrl, setPosterImageUrl] = useState(defaultForm.posterImageUrl);
  const [posterImageName, setPosterImageName] = useState(defaultForm.posterImageName);
  const [draftBodies, setDraftBodies] = useState({
    emailBody: defaultForm.emailBody,
    whatsappBody: defaultForm.whatsappBody,
  });
  const [sampleVariables, setSampleVariables] = useState({
    business_name: "Sample Business",
    restaurant_name: defaultForm.restaurantName,
    offer: defaultForm.offer,
    address: defaultForm.restaurantAddress,
    phone: defaultForm.restaurantPhone,
    order_link: defaultForm.restaurantWebsite,
  });
  const [testRecipients, setTestRecipients] = useState({
    businessName: "IndiaWaale Test",
    email: "",
    phone: "",
  });

  function syncDraftPreview(form: HTMLFormElement) {
    const formData = new FormData(form);
    const address = String(formData.get("restaurantAddress") ?? defaultForm.restaurantAddress);
    const website = String(formData.get("restaurantWebsite") ?? defaultForm.restaurantWebsite);

    setDraftBodies({
      emailBody: String(formData.get("emailBody") ?? defaultForm.emailBody),
      whatsappBody: String(formData.get("whatsappBody") ?? defaultForm.whatsappBody),
    });

    setSampleVariables({
      business_name: "Sample Business",
      restaurant_name: String(formData.get("restaurantName") ?? defaultForm.restaurantName),
      offer: String(formData.get("offer") ?? defaultForm.offer),
      address,
      phone: String(formData.get("restaurantPhone") ?? defaultForm.restaurantPhone),
      order_link: website || address,
    });
  }

  async function loadCampaigns() {
    const response = await fetch("/api/campaigns");
    const payload = await response.json();
    setCampaigns(payload.campaigns ?? []);
    if (!selectedCampaignId && payload.campaigns?.[0]?.id) {
      setSelectedCampaignId(payload.campaigns[0].id);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  async function generateSubjects(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;

    const formData = new FormData(form);
    setIsGeneratingSubjects(true);
    setMessage(null);

    try {
      const response = await fetch("/api/campaigns/generate-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: String(formData.get("restaurantName") ?? defaultForm.restaurantName),
          offer: String(formData.get("offer") ?? defaultForm.offer),
          campaignContext: String(formData.get("campaignContext") ?? defaultForm.campaignContext),
          cuisine: "Indian",
        }),
      });
      const payload = await response.json();
      setSubjectSuggestions(payload.suggestions ?? SUBJECT_LINE_SUGGESTIONS);
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to generate subject lines");
      }
      setMessage(`Generated subject ideas using ${payload.source}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate subject lines");
    } finally {
      setIsGeneratingSubjects(false);
    }
  }

  async function generateCampaignCopy(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;

    const formData = new FormData(form);
    setIsGeneratingCopy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/campaigns/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: String(formData.get("restaurantName") ?? defaultForm.restaurantName),
          restaurantAddress: String(formData.get("restaurantAddress") ?? defaultForm.restaurantAddress),
          restaurantPhone: String(formData.get("restaurantPhone") ?? defaultForm.restaurantPhone),
          restaurantWebsite: String(formData.get("restaurantWebsite") ?? defaultForm.restaurantWebsite),
          offer: String(formData.get("offer") ?? defaultForm.offer),
          campaignContext: String(formData.get("campaignContext") ?? defaultForm.campaignContext),
          cuisine: "Indian",
        }),
      });
      const payload = await response.json();

      const subjectInput = form.elements.namedItem("emailSubject") as HTMLInputElement | null;
      const emailBodyInput = form.elements.namedItem("emailBody") as HTMLTextAreaElement | null;
      const whatsappBodyInput = form.elements.namedItem("whatsappBody") as HTMLTextAreaElement | null;

      if (subjectInput) {
        subjectInput.value = payload.emailSubject ?? defaultForm.emailSubject;
      }
      if (emailBodyInput) {
        emailBodyInput.value = payload.emailBody ?? defaultForm.emailBody;
      }
      if (whatsappBodyInput) {
        whatsappBodyInput.value = payload.whatsappBody ?? defaultForm.whatsappBody;
      }
      if (payload.emailSubject) {
        setSubjectSuggestions((current) => Array.from(new Set([payload.emailSubject, ...current])).slice(0, 6));
      }
      syncDraftPreview(form);

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to generate campaign copy");
      }

      setMessage(`Generated campaign copy using ${payload.source}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate campaign copy");
    } finally {
      setIsGeneratingCopy(false);
    }
  }

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("posterImageUrl", posterImageUrl);
    formData.set("posterImageName", posterImageName);
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to create campaign");
      return;
    }
    setSelectedCampaignId(payload.campaign.id);
    setMessage("Campaign created.");
    await loadCampaigns();
  }

  async function handlePosterFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPosterImageName("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextValue = typeof reader.result === "string" ? reader.result : "";
      setPosterImageUrl(nextValue);
      setPosterImageName(file.name);
      setMessage(`Poster ready: ${file.name}`);
    };
    reader.onerror = () => {
      setMessage("Unable to read the selected poster image.");
    };
    reader.readAsDataURL(file);
  }

  async function handlePreview() {
    if (!selectedCampaignId) return;
    const response = await fetch(`/api/campaigns/${selectedCampaignId}/preview`, {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to preview campaign");
      return;
    }
    setPreview(payload);
    setMessage("Campaign preview generated.");
    await loadCampaigns();
  }

  async function launch(channel: "send-email" | "send-whatsapp" | "send-sms") {
    if (!selectedCampaignId) return;
    if (channel === "send-sms") setIsLaunchingSms(true);
    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/${channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel === "send-sms" ? { dryRun, mms } : { dryRun }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Launch failed");
        return;
      }
      const sentCount = Array.isArray(payload.results) ? payload.results.length : 0;
      const label =
        channel === "send-email" ? "Email" : channel === "send-whatsapp" ? "WhatsApp" : mms ? "MMS" : "SMS";
      setMessage(
        `${label} execution finished (${sentCount} ${dryRun ? "validated" : "sent"}).`,
      );
      await loadCampaigns();
    } finally {
      if (channel === "send-sms") setIsLaunchingSms(false);
    }
  }

  async function sendTest(channel: "email" | "sms") {
    if (!selectedCampaignId) {
      setMessage("Select a campaign before sending a test message.");
      return;
    }

    if (channel === "email" && !testRecipients.email.trim()) {
      setMessage("Enter a test email address.");
      return;
    }

    if (channel === "sms" && !testRecipients.phone.trim()) {
      setMessage("Enter a test SMS number.");
      return;
    }

    const setLoading = channel === "email" ? setIsSendingTestEmail : setIsSendingTestSms;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/campaigns/${selectedCampaignId}/${channel === "email" ? "send-test-email" : "send-test-sms"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dryRun,
            businessName: testRecipients.businessName,
            email: testRecipients.email,
            phone: testRecipients.phone,
            ...(channel === "sms" ? { mms } : {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `Unable to send test ${channel}.`);
      }

      setMessage(`Test ${channel} ${dryRun ? "validated" : "sent"} to ${payload.result.destination}.`);
      await loadCampaigns();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to send test ${channel}.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="panel rounded-[28px] p-6">
        <p className="eyebrow">Campaign Builder</p>
        <h2 className="title-display mt-2 text-3xl font-semibold">Create restaurant promotions</h2>
        <form onSubmit={createCampaign} onInput={(event) => syncDraftPreview(event.currentTarget)} className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <input name="name" defaultValue={defaultForm.name} placeholder="Campaign name" className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <div className="space-y-2">
              <input name="emailSubject" defaultValue={defaultForm.emailSubject} placeholder="Email subject" className="w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={generateSubjects}
                  disabled={isGeneratingSubjects || isGeneratingCopy}
                  className="rounded-2xl border border-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)] disabled:opacity-60"
                >
                  {isGeneratingSubjects ? "Generating ideas..." : "Generate AI subject ideas"}
                </button>
                <button
                  type="button"
                  onClick={generateCampaignCopy}
                  disabled={isGeneratingCopy || isGeneratingSubjects}
                  className="rounded-2xl bg-[#2c211b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isGeneratingCopy ? "Generating full copy..." : "Generate AI full campaign copy"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 rounded-[24px] border border-[var(--stroke)] bg-white p-4">
            <label htmlFor="campaignContext" className="text-sm font-semibold text-[var(--muted)]">
              AI context
            </label>
            <textarea
              id="campaignContext"
              name="campaignContext"
              rows={4}
              defaultValue={defaultForm.campaignContext}
              placeholder="Add audience, differentiators, tone, geography, exclusions, seasonal notes, or any other context the AI should use."
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3"
            />
            <p className="text-xs text-[var(--muted)]">
              Use this for details like target businesses, cuisine highlights, delivery radius, pricing, tone, or campaign goals.
            </p>
          </div>

          <div className="grid gap-2">
            <textarea name="emailBody" rows={6} defaultValue={defaultForm.emailBody} className="rounded-3xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <p className="px-1 text-xs text-[var(--muted)]">
              Template tokens stay visible here while editing. They are replaced with real lead and restaurant values in Campaign Preview and when messages are sent.
            </p>
            <div className="rounded-[24px] bg-[#f7f0e8] p-4 text-sm">
              <p className="font-semibold text-[var(--muted)]">Live sample render</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--accent-strong)]">
                {renderTemplate(draftBodies.emailBody, sampleVariables)}
              </pre>
            </div>
          </div>
          <div className="grid gap-2">
            <textarea name="whatsappBody" rows={4} defaultValue={defaultForm.whatsappBody} className="rounded-3xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <p className="px-1 text-xs text-[var(--muted)]">
              WhatsApp uses the same template tokens and resolves them during preview and send.
            </p>
            <div className="rounded-[24px] bg-[#eef7ef] p-4 text-sm">
              <p className="font-semibold text-[var(--muted)]">Live WhatsApp sample</p>
              <p className="mt-2 leading-6 text-[var(--accent-strong)]">{renderTemplate(draftBodies.whatsappBody, sampleVariables)}</p>
            </div>
          </div>
          <div className="grid gap-3 rounded-[24px] border border-[var(--stroke)] bg-white p-4">
            <p className="text-sm font-semibold text-[var(--muted)]">Email poster</p>
            <input
              name="posterImageUrlInput"
              value={posterImageUrl}
              onChange={(event) => {
                setPosterImageUrl(event.target.value);
                if (!event.target.value) {
                  setPosterImageName("");
                }
              }}
              placeholder="Poster image URL for email (optional)"
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3"
            />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handlePosterFileChange}
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
            <input type="hidden" name="posterImageUrl" value={posterImageUrl} />
            <input type="hidden" name="posterImageName" value={posterImageName} />
            <p className="text-xs text-[var(--muted)]">Paste an image URL or upload a poster file. Uploaded posters will be embedded in the email and added as an attachment.</p>
            {posterImageUrl ? (
              <img
                src={posterImageUrl}
                alt="Poster draft preview"
                className="max-h-72 w-full rounded-2xl border border-[var(--stroke)] object-contain"
              />
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input name="offer" defaultValue={defaultForm.offer} placeholder="Offer" className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <input name="offerExpiryDate" type="date" defaultValue={defaultForm.offerExpiryDate} className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <input name="restaurantName" defaultValue={defaultForm.restaurantName} placeholder="Restaurant name" className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <input name="restaurantAddress" defaultValue={defaultForm.restaurantAddress} placeholder="Address" className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <input name="restaurantPhone" defaultValue={defaultForm.restaurantPhone} placeholder="Phone" className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
            <input name="restaurantWebsite" defaultValue={defaultForm.restaurantWebsite} placeholder="Website or order link" className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3" />
          </div>

          <div className="rounded-[24px] bg-white/80 p-4 text-sm">
            <p className="font-semibold text-[var(--muted)]">Template variables</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              These placeholders are filled when you click Generate preview or launch a send. Example: <span className="font-medium">{"{{business_name}}"}</span> becomes the selected lead&apos;s business name.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((variable) => (
                <span key={variable} className="rounded-full bg-[#f5eadf] px-3 py-1 text-[var(--accent-strong)]">
                  {variable}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] bg-[#fff7ed] p-4 text-sm">
            <p className="font-semibold text-[var(--muted)]">Subject line suggestions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {subjectSuggestions.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    const input = form?.elements.namedItem("emailSubject") as HTMLInputElement | null;
                    if (input) {
                      input.value = subject;
                    }
                  }}
                  className="rounded-full border border-[var(--stroke)] px-3 py-1 text-left"
                >
                  {subject}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
              Dry-run mode
            </label>
            <button type="submit" className="rounded-2xl bg-[var(--accent)] px-5 py-3 font-semibold text-white">
              Save campaign
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-6">
        <div className="panel rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Campaign Preview</p>
              <h3 className="title-display mt-2 text-2xl font-semibold">Validate and launch</h3>
            </div>
            <select
              value={selectedCampaignId}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            >
              <option value="">Select campaign</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={handlePreview} className="rounded-2xl border border-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-strong)]">
              Generate preview
            </button>
            <button onClick={() => void launch("send-email")} className="rounded-2xl bg-[#2c211b] px-4 py-3 text-sm font-semibold text-white">
              Validate & launch email
            </button>
            <button onClick={() => void launch("send-whatsapp")} className="rounded-2xl bg-[var(--success)] px-4 py-3 text-sm font-semibold text-white">
              Validate & launch WhatsApp
            </button>
            <button
              onClick={() => void launch("send-sms")}
              disabled={isLaunchingSms}
              className="rounded-2xl bg-[#1f6f8b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLaunchingSms
                ? `Sending ${mms ? "MMS" : "SMS"}...`
                : `Validate & launch ${mms ? "MMS" : "SMS"}`}
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={mms}
              onChange={(event) => setMms(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--stroke)]"
            />
            Attach poster as MMS (image message). Applies to the SMS launch and test SMS below.
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">
            SMS/MMS only sends to opted-in phone numbers (same consented audience as WhatsApp). Non-consented scraped numbers are never contacted.
          </p>

          {message ? <p className="mt-4 text-sm text-[var(--accent-strong)]">{message}</p> : null}

          {preview ? (
            <div className="mt-5 space-y-4 rounded-[24px] bg-white/85 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-[#f7f0e8] p-4">
                  <p className="text-sm text-[var(--muted)]">Approved email recipients</p>
                  <p className="mt-2 text-3xl font-semibold">{preview.emailRecipients.length}</p>
                </div>
                <div className="rounded-2xl bg-[#eef7ef] p-4">
                  <p className="text-sm text-[var(--muted)]">Approved WhatsApp recipients</p>
                  <p className="mt-2 text-3xl font-semibold">{preview.whatsappRecipients.length}</p>
                </div>
                <div className="rounded-2xl bg-[#e8f1f4] p-4 md:col-span-2">
                  <p className="text-sm text-[var(--muted)]">Opted-in SMS / MMS recipients</p>
                  <p className="mt-2 text-3xl font-semibold">{preview.whatsappRecipients.length}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Consent-gated audience used by the SMS/MMS launch.
                  </p>
                </div>
              </div>

              <div>
                <p className="font-semibold">Compliance checklist</p>
                <ul className="mt-2 space-y-2 text-sm text-[var(--muted)]">
                  {preview.complianceChecklist.map((item) => (
                    <li key={item.label}>
                      {item.passed ? "Pass" : "Review"}: {item.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-[var(--stroke)] p-4">
                <p className="text-sm text-[var(--muted)]">Email preview</p>
                <p className="mt-2 font-semibold">{preview.emailPreview.subject}</p>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{preview.emailPreview.body}</pre>
                {preview.emailPreview.posterImageUrl ? (
                  <img
                    src={preview.emailPreview.posterImageUrl}
                    alt="Campaign poster preview"
                    className="mt-4 max-h-72 w-full rounded-2xl border border-[var(--stroke)] object-contain"
                  />
                ) : null}
              </div>

              <div className="rounded-2xl border border-[var(--stroke)] p-4">
                <p className="text-sm text-[var(--muted)]">WhatsApp preview</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{preview.whatsappPreview}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel rounded-[28px] p-6">
          <p className="eyebrow">Test Delivery</p>
          <h3 className="title-display mt-2 text-2xl font-semibold">Send to your own inbox or phone</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This bypasses approved-lead targeting and sends the selected campaign directly to your test recipients.
          </p>

          <div className="mt-4 grid gap-3">
            <input
              value={testRecipients.businessName}
              onChange={(event) => setTestRecipients((current) => ({ ...current, businessName: event.target.value }))}
              placeholder="Test business name"
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
            <input
              value={testRecipients.email}
              onChange={(event) => setTestRecipients((current) => ({ ...current, email: event.target.value }))}
              placeholder="Test email address"
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
            <input
              value={testRecipients.phone}
              onChange={(event) => setTestRecipients((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Test SMS number"
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => void sendTest("email")}
              disabled={isSendingTestEmail || isSendingTestSms}
              className="rounded-2xl bg-[#2c211b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSendingTestEmail ? "Sending test email..." : dryRun ? "Validate test email" : "Send test email"}
            </button>
            <button
              onClick={() => void sendTest("sms")}
              disabled={isSendingTestSms || isSendingTestEmail}
              className="rounded-2xl bg-[var(--success)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSendingTestSms
                ? `Sending test ${mms ? "MMS" : "SMS"}...`
                : dryRun
                  ? `Validate test ${mms ? "MMS" : "SMS"}`
                  : `Send test ${mms ? "MMS" : "SMS"}`}
            </button>
          </div>

          <p className="mt-3 text-xs text-[var(--muted)]">
            Select a saved campaign first. Dry-run mode applies here too, so turn it off before a real live send.
          </p>
        </div>

        <div className="panel rounded-[28px] p-6">
          <p className="eyebrow">Campaign Status</p>
          <div className="mt-4 space-y-3">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-[24px] bg-white/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{campaign.name}</p>
                    <p className="text-sm text-[var(--muted)]">{campaign.restaurantName}</p>
                  </div>
                  <span className="rounded-full bg-[#f5eadf] px-3 py-1 text-xs font-semibold text-[var(--accent-strong)]">
                    {campaign.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {campaign.recipients.length} tracked recipients, {campaign.messageLogs.length} message logs.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
