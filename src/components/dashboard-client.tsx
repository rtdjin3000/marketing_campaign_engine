"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SEARCH_CATEGORIES } from "@/lib/constants";

type Lead = {
  id: string;
  name: string;
  address: string;
  category: string;
  source: string;
  websiteUrl?: string | null;
  googleMapsUrl?: string | null;
  distanceMeters?: number | null;
  validationStatus: string;
  notes?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  whatsappEligible: boolean;
  hasPriorRelation: boolean;
  contacts: Array<{
    id: string;
    kind: string;
    value: string;
    source?: string;
    confidenceScore: number;
    hasOptIn: boolean;
    whatsappEligible: boolean;
  }>;
};

type GeocodeResponse = {
  locationId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  source: string;
};

type LocationSuggestion = {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText?: string;
};

const statusStyles: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-900",
  REJECTED: "bg-rose-100 text-rose-900",
  CONTACTED: "bg-sky-100 text-sky-900",
};

export function DashboardClient() {
  const [query, setQuery] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [filters, setFilters] = useState({
    hasEmail: false,
    hasPhone: false,
    category: "",
    validationStatus: "",
  });
  const [geocode, setGeocode] = useState<GeocodeResponse | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autocompleteRequestRef = useRef(0);

  async function loadLeads() {
    const search = new URLSearchParams();
    if (filters.hasEmail) search.set("hasEmail", "true");
    if (filters.hasPhone) search.set("hasPhone", "true");
    if (filters.category) search.set("category", filters.category);
    if (filters.validationStatus) search.set("validationStatus", filters.validationStatus);

    const response = await fetch(`/api/leads?${search.toString()}`);
    const payload = await response.json();
    setLeads(payload.leads ?? []);
  }

  useEffect(() => {
    void loadLeads();
  }, [filters]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setAutocompleteError(null);
      return;
    }

    const timeout = window.setTimeout(async () => {
      const requestId = autocompleteRequestRef.current + 1;
      autocompleteRequestRef.current = requestId;
      setIsAutocompleteLoading(true);
      setAutocompleteError(null);
      try {
        const response = await fetch("/api/location-autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to fetch location suggestions");
        }
        if (autocompleteRequestRef.current !== requestId) {
          return;
        }
        setSuggestions(payload.suggestions ?? []);
        if ((payload.suggestions ?? []).length === 0) {
          setAutocompleteError("No Google address suggestions found for that search.");
        }
      } catch (error) {
        if (autocompleteRequestRef.current !== requestId) {
          return;
        }
        setSuggestions([]);
        setAutocompleteError(
          error instanceof Error ? error.message : "Unable to fetch location suggestions",
        );
      } finally {
        if (autocompleteRequestRef.current === requestId) {
          setIsAutocompleteLoading(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [leads, selectedLeadIds],
  );

  async function discoverNearbyBusinesses(nextGeocode: GeocodeResponse) {
    const response = await fetch("/api/search-businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextGeocode),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Business discovery failed");
    }

    await loadLeads();
    return {
      count: payload.count as number,
      enrichment: payload.enrichment as
        | {
            processed: number;
            enriched: number;
            createdContacts: number;
          }
        | undefined,
    };
  }

  async function handleGeocode(override?: { query: string; placeId?: string | null }) {
    setIsLoading(true);
    setMessage(null);
    try {
      const geocodeQuery = override?.query ?? query;
      const geocodePlaceId = override?.placeId ?? selectedPlaceId;
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: geocodeQuery, placeId: geocodePlaceId ?? undefined, radiusKm }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const nextGeocode = payload as GeocodeResponse;
      setGeocode(nextGeocode);
      setQuery(payload.formattedAddress);
      setSelectedPlaceId(null);
      setSuggestions([]);
      const result = await discoverNearbyBusinesses(nextGeocode);
      setMessage(
        `Geocoded ${payload.formattedAddress} and loaded ${result.count} nearby businesses within ${nextGeocode.radiusKm} km. Auto-enrichment scanned ${result.enrichment?.processed ?? 0} websites and found ${result.enrichment?.createdContacts ?? 0} public contacts.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to geocode address");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSearchBusinesses() {
    if (!geocode) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const result = await discoverNearbyBusinesses(geocode);
      setMessage(
        `Loaded ${result.count} nearby businesses within ${geocode.radiusKm} km. Auto-enrichment scanned ${result.enrichment?.processed ?? 0} websites and found ${result.enrichment?.createdContacts ?? 0} public contacts.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Business discovery failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBulkStatus(validationStatus: "APPROVED" | "REJECTED") {
    await Promise.all(
      selectedLeadIds.map((id) =>
        fetch(`/api/leads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ validationStatus }),
        }),
      ),
    );
    setSelectedLeadIds([]);
    await loadLeads();
  }

  async function handleCloverImport() {
    setIsLoading(true);
    setMessage("Importing customers from Clover...");
    try {
      const response = await fetch("/api/clover/import-customers", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Clover import failed");
      }
      const s = payload.summary as {
        fetched: number;
        createdBusinesses: number;
        updatedBusinesses: number;
        emailsLinked: number;
        phonesLinked: number;
        skipped: number;
      };
      setMessage(
        `Clover import complete. Fetched ${s.fetched} customers — created ${s.createdBusinesses}, updated ${s.updatedBusinesses}, linked ${s.emailsLinked} emails and ${s.phonesLinked} phones (skipped ${s.skipped} with no contact info).`,
      );
      await loadLeads();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Clover import failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveLeadEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeLead) return;
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/leads/${activeLead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryEmail: formData.get("primaryEmail"),
        primaryPhone: formData.get("primaryPhone"),
        validationStatus: formData.get("validationStatus"),
        whatsappEligible: formData.get("whatsappEligible") === "on",
        hasPriorRelation: formData.get("hasPriorRelation") === "on",
        hasOptIn: formData.get("hasOptIn") === "on",
        notes: formData.get("notes"),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save lead edits");
      return;
    }
    setActiveLead(null);
    await loadLeads();
    setMessage("Lead updated.");
  }

  function handleSuggestionSelect(suggestion: LocationSuggestion) {
    setQuery(suggestion.description);
    setSelectedPlaceId(suggestion.placeId);
    setSuggestions([]);
    setAutocompleteError(null);
    setMessage(`Selected ${suggestion.description}`);
  }

  function getAutoEnrichmentStatus(lead: Lead) {
    if (!lead.websiteUrl) {
      return { label: "No website", style: "bg-stone-100 text-stone-700" };
    }

    const websiteContacts = lead.contacts.filter((contact) => contact.source === "website_public_pages");
    const websiteEmail = websiteContacts.find((contact) => contact.kind === "EMAIL");

    if (websiteEmail) {
      return { label: "Email found", style: "bg-emerald-100 text-emerald-900" };
    }

    if (websiteContacts.length > 0) {
      return { label: "Scanned", style: "bg-sky-100 text-sky-900" };
    }

    return { label: "Pending scan", style: "bg-amber-100 text-amber-900" };
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel rounded-[28px] p-6">
          <p className="eyebrow">Location Input</p>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_120px_auto]">
            <div className="relative">
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedPlaceId(null);
                  setAutocompleteError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && suggestions.length > 0) {
                    event.preventDefault();
                    const firstSuggestion = suggestions[0];
                    handleSuggestionSelect(firstSuggestion);
                    void handleGeocode({
                      query: firstSuggestion.description,
                      placeId: firstSuggestion.placeId,
                    });
                  }
                }}
                placeholder="Search restaurant name or address"
                className="w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 outline-none"
              />
              {suggestions.length > 0 ? (
                <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white shadow-lg">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.placeId}
                      type="button"
                      onClick={() => handleSuggestionSelect(suggestion)}
                      className="block w-full border-b border-[var(--stroke)] px-4 py-3 text-left last:border-b-0 hover:bg-[#fff7ed]"
                    >
                      <div className="font-medium text-[var(--text)]">{suggestion.primaryText}</div>
                      {suggestion.secondaryText ? (
                        <div className="mt-1 text-sm text-[var(--muted)]">{suggestion.secondaryText}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <input
              type="number"
              min={1}
              max={15}
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value) || 5)}
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 outline-none"
            />
            <button
              onClick={() => void handleGeocode()}
              disabled={!query || isLoading}
              className="rounded-2xl bg-[var(--accent)] px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              Detect location
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
            <span>{isAutocompleteLoading ? "Searching Google suggestions..." : "Start typing to search Google locations."}</span>
            {selectedPlaceId ? <span>Google suggestion selected</span> : null}
            {autocompleteError ? <span className="text-[var(--danger)]">{autocompleteError}</span> : null}
          </div>

          {geocode ? (
            <div className="mt-5 rounded-[24px] bg-white/80 p-5">
              <p className="text-sm text-[var(--muted)]">Detected coordinates</p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <span>{geocode.formattedAddress}</span>
                <span>Lat {geocode.latitude.toFixed(5)}</span>
                <span>Lng {geocode.longitude.toFixed(5)}</span>
                <span>Source {geocode.source}</span>
              </div>
              <button
                onClick={handleSearchBusinesses}
                disabled={isLoading}
                className="mt-4 rounded-2xl border border-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent-strong)]"
              >
                Refresh nearby businesses within {geocode.radiusKm} km
              </button>
            </div>
          ) : null}
        </div>

        <div className="panel rounded-[28px] p-6">
          <p className="eyebrow">Discovery Focus</p>
          <h2 className="title-display mt-3 text-2xl font-semibold">Approved categories</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {SEARCH_CATEGORIES.map((category) => (
              <span key={category} className="rounded-full bg-white px-3 py-1 text-sm text-[var(--muted)]">
                {category}
              </span>
            ))}
          </div>
          <div className="mt-5 rounded-[24px] bg-[#fff7ed] p-4 text-sm leading-6 text-[var(--muted)]">
            Only public business emails and public business phone numbers are retained. Campaigns stay blocked until a human approves the lead.
          </div>
        </div>
      </section>

      <section className="panel rounded-[28px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Lead Review Dashboard</p>
            <h2 className="title-display mt-2 text-2xl font-semibold">Manual validation before outreach</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void handleCloverImport()}
              disabled={isLoading}
              className="rounded-2xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Import from Clover
            </button>
            <button
              onClick={() => void handleBulkStatus("APPROVED")}
              disabled={selectedLeadIds.length === 0}
              className="rounded-2xl bg-[var(--success)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Approve selected
            </button>
            <button
              onClick={() => void handleBulkStatus("REJECTED")}
              disabled={selectedLeadIds.length === 0}
              className="rounded-2xl bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Reject selected
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <label className="rounded-2xl bg-white px-4 py-3 text-sm">
            <span className="block text-[var(--muted)]">Category</span>
            <select
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              className="mt-2 w-full bg-transparent outline-none"
            >
              <option value="">All</option>
              {SEARCH_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-2xl bg-white px-4 py-3 text-sm">
            <span className="block text-[var(--muted)]">Validation status</span>
            <select
              value={filters.validationStatus}
              onChange={(event) =>
                setFilters((current) => ({ ...current, validationStatus: event.target.value }))
              }
              className="mt-2 w-full bg-transparent outline-none"
            >
              <option value="">All</option>
              <option value="PENDING_REVIEW">Pending review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CONTACTED">Contacted</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={filters.hasEmail}
              onChange={(event) => setFilters((current) => ({ ...current, hasEmail: event.target.checked }))}
            />
            Has email
          </label>

          <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={filters.hasPhone}
              onChange={(event) => setFilters((current) => ({ ...current, hasPhone: event.target.checked }))}
            />
            Has phone
          </label>
        </div>

        {message ? <p className="mt-4 text-sm text-[var(--accent-strong)]">{message}</p> : null}

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
          <span>{leads.length} leads loaded</span>
          {geocode ? <span>Current search area: {geocode.formattedAddress}</span> : null}
        </div>

        <div className="mt-5 overflow-x-auto rounded-[24px] bg-white/80">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length}
                    onChange={(event) =>
                      setSelectedLeadIds(event.target.checked ? leads.map((lead) => lead.id) : [])
                    }
                  />
                </th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Distance</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Auto-enriched</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-[var(--stroke)] align-top">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={(event) =>
                        setSelectedLeadIds((current) =>
                          event.target.checked
                            ? [...current, lead.id]
                            : current.filter((value) => value !== lead.id),
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold">{lead.name}</div>
                    <div className="mt-1 text-[var(--muted)]">{lead.address}</div>
                    {lead.websiteUrl ? (
                      <a className="mt-2 inline-block text-[var(--accent-strong)]" href={lead.websiteUrl} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">{lead.category}</td>
                  <td className="px-4 py-4">
                    {lead.distanceMeters ? `${(lead.distanceMeters / 1000).toFixed(1)} km` : "-"}
                  </td>
                  <td className="px-4 py-4">
                    <div>{lead.primaryEmail ?? "No email"}</div>
                    <div className="mt-1 text-[var(--muted)]">{lead.primaryPhone ?? "No phone"}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[lead.validationStatus]}`}>
                      {lead.validationStatus.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {(() => {
                      const enrichmentStatus = getAutoEnrichmentStatus(lead);
                      return (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${enrichmentStatus.style}`}>
                          {enrichmentStatus.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => setActiveLead(lead)}
                      className="rounded-xl bg-[#2c211b] px-3 py-2 text-xs font-semibold text-white"
                    >
                      Human validation
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedLeads.length > 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">{selectedLeads.length} leads selected for approval workflow.</p>
        ) : null}
      </section>

      {activeLead ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#2c211b]/35 p-4">
          <form onSubmit={saveLeadEdits} className="panel w-full max-w-2xl rounded-[30px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Lead Validation</p>
                <h3 className="title-display mt-2 text-2xl font-semibold">{activeLead.name}</h3>
              </div>
              <button type="button" onClick={() => setActiveLead(null)} className="text-sm text-[var(--muted)]">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="block text-[var(--muted)]">Public business email</span>
                <input
                  name="primaryEmail"
                  defaultValue={activeLead.primaryEmail ?? ""}
                  className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3"
                />
              </label>

              <label className="text-sm">
                <span className="block text-[var(--muted)]">Public business phone</span>
                <input
                  name="primaryPhone"
                  defaultValue={activeLead.primaryPhone ?? ""}
                  className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3"
                />
              </label>

              <label className="text-sm">
                <span className="block text-[var(--muted)]">Validation status</span>
                <select
                  name="validationStatus"
                  defaultValue={activeLead.validationStatus}
                  className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3"
                >
                  <option value="PENDING_REVIEW">Pending review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CONTACTED">Contacted</option>
                </select>
              </label>

              <label className="text-sm">
                <span className="block text-[var(--muted)]">Notes</span>
                <textarea
                  name="notes"
                  rows={4}
                  defaultValue={activeLead.notes ?? ""}
                  className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input name="whatsappEligible" type="checkbox" defaultChecked={activeLead.whatsappEligible} />
                WhatsApp eligible
              </label>
              <label className="flex items-center gap-2">
                <input name="hasPriorRelation" type="checkbox" defaultChecked={activeLead.hasPriorRelation} />
                Prior business relationship
              </label>
              <label className="flex items-center gap-2">
                <input name="hasOptIn" type="checkbox" defaultChecked={false} />
                Explicit WhatsApp opt-in verified
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setActiveLead(null)} className="rounded-2xl px-4 py-3 text-sm">
                Cancel
              </button>
              <button type="submit" className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
                Save validation
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
