import { Channel, MessageLogStatus, RecipientStatus, ValidationStatus } from "@prisma/client";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  EXCLUDED_BUSINESS_KEYWORDS,
  EXCLUDED_PLACE_TYPES,
  PUBLIC_PATHS,
  SEARCH_CATEGORIES,
} from "@/lib/constants";
import {
  haversineDistanceMeters,
  isGenericBusinessEmail,
  normalizePhone,
  renderTemplate,
  serializeJson,
} from "@/lib/utils";

type GeocodeResult = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  source: string;
};

type LocationSuggestion = {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText?: string;
};

type BusinessSeed = {
  name: string;
  address: string;
  category: string;
  placeTypes?: string[];
  phone?: string;
  website?: string;
  googleMapsUrl?: string;
  latitude: number;
  longitude: number;
  googlePlaceId: string;
};

export async function geocodeAddress(query: string, placeId?: string): Promise<GeocodeResult> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return {
      formattedAddress: query,
      latitude: 28.6139,
      longitude: 77.209,
      source: "mock",
    };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  if (placeId) {
    url.searchParams.set("place_id", placeId);
  } else {
    url.searchParams.set("address", query);
  }
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };

  const result = payload.results?.[0];
  if (!response.ok || payload.status !== "OK" || !result) {
    throw new Error("Unable to geocode the provided address.");
  }

  return {
    formattedAddress: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    source: "google_geocoding_api",
  };
}

export async function getLocationAutocompleteSuggestions(query: string): Promise<LocationSuggestion[]> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return [
      {
        placeId: "mock-place-restaurant",
        description: `${query}, Connaught Place, New Delhi`,
        primaryText: query,
        secondaryText: "Connaught Place, New Delhi",
      },
      {
        placeId: "mock-place-market",
        description: `${query}, Market Street`,
        primaryText: query,
        secondaryText: "Market Street",
      },
    ];
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  // When the user types a street-like address, bias results toward postal addresses
  // instead of businesses that happen to contain matching tokens.
  if (/\d/.test(query) || /\b(road|rd|street|st|avenue|ave|drive|dr|lane|ln|boulevard|blvd)\b/i.test(query)) {
    url.searchParams.set("types", "address");
  }

  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as {
    status: string;
    predictions?: Array<{
      description: string;
      place_id: string;
      structured_formatting?: {
        main_text?: string;
        secondary_text?: string;
      };
    }>;
    error_message?: string;
  };

  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(payload.status)) {
    throw new Error(payload.error_message ?? "Unable to fetch location suggestions.");
  }

  return (payload.predictions ?? []).slice(0, 5).map((prediction) => ({
    placeId: prediction.place_id,
    description: prediction.description,
    primaryText: prediction.structured_formatting?.main_text ?? prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text,
  }));
}

function buildMockBusinesses(latitude: number, longitude: number): BusinessSeed[] {
  return SEARCH_CATEGORIES.map((category, index) => ({
    name: `${category.replace(/\b\w/g, (letter) => letter.toUpperCase())} Hub ${index + 1}`,
    address: `${100 + index} Commerce Avenue`,
    category,
    placeTypes: [category.replace(/\s+/g, "_").toLowerCase()],
    phone: `+1 555 01${String(index).padStart(2, "0")}`,
    website: `https://${category.replace(/[^a-z]/gi, "") || "business"}${index + 1}.example.com`,
    googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:mock-place-${index + 1}`,
    latitude: latitude + (index + 1) * 0.0022,
    longitude: longitude + (index + 1) * 0.0018,
    googlePlaceId: `mock-place-${index + 1}`,
  }));
}

async function getGooglePlaceDetails(placeId: string) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,formatted_address,website,formatted_phone_number,geometry,url,types");
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as {
    result?: {
      name?: string;
      formatted_address?: string;
      website?: string;
      formatted_phone_number?: string;
      url?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      types?: string[];
    };
  };

  return payload.result ?? null;
}

function isExcludedBusiness(input: { name: string; address: string; types?: string[] }) {
  const haystack = `${input.name} ${input.address}`.toLowerCase();
  const matchesKeyword = EXCLUDED_BUSINESS_KEYWORDS.some((keyword) => haystack.includes(keyword));
  const matchesType = (input.types ?? []).some((type) => EXCLUDED_PLACE_TYPES.includes(type));
  return matchesKeyword || matchesType;
}

export async function discoverBusinesses(input: {
  locationId: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}) {
  const discovered = env.GOOGLE_MAPS_API_KEY
    ? await Promise.all(
        SEARCH_CATEGORIES.map(async (category) => {
          const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
          url.searchParams.set("query", category);
          url.searchParams.set("location", `${input.latitude},${input.longitude}`);
          url.searchParams.set("radius", String(Math.round(input.radiusKm * 1000)));
          url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY ?? "");

          const response = await fetch(url, { cache: "no-store" });
          const payload = (await response.json()) as {
            results?: Array<{
              place_id: string;
              name: string;
              formatted_address?: string;
              geometry?: { location?: { lat?: number; lng?: number } };
              types?: string[];
            }>;
          };

          return Promise.all(
            (payload.results ?? []).slice(0, 8).map(async (result) => {
              const details = await getGooglePlaceDetails(result.place_id);
              const latitude = details?.geometry?.location?.lat ?? result.geometry?.location?.lat ?? input.latitude;
              const longitude = details?.geometry?.location?.lng ?? result.geometry?.location?.lng ?? input.longitude;

              return {
                name: details?.name ?? result.name,
                address: details?.formatted_address ?? result.formatted_address ?? "Address unavailable",
                category,
                placeTypes: details?.types ?? result.types ?? [],
                phone: details?.formatted_phone_number,
                website: details?.website,
                latitude,
                longitude,
                googlePlaceId: result.place_id,
                googleMapsUrl:
                  details?.url ?? `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
              };
            }),
          );
        }),
      )
    : [buildMockBusinesses(input.latitude, input.longitude)];

  const flattened = discovered.flat();
  const filtered = flattened.filter((item) => {
    if (isExcludedBusiness({ name: item.name, address: item.address, types: item.placeTypes })) {
      return false;
    }

    const distanceMeters = haversineDistanceMeters(
      input.latitude,
      input.longitude,
      item.latitude,
      item.longitude,
    );
    return distanceMeters <= input.radiusKm * 1000;
  });

  const upserts = [];

  for (const item of filtered) {
      const distanceMeters = haversineDistanceMeters(
        input.latitude,
        input.longitude,
        item.latitude,
        item.longitude,
      );

      const business = await prisma.business.upsert({
        where: { googlePlaceId: item.googlePlaceId },
        update: {
          locationId: input.locationId,
          name: item.name,
          address: item.address,
          category: item.category,
          source: env.GOOGLE_MAPS_API_KEY ? "google_places_api" : "mock_places",
          googleMapsUrl: item.googleMapsUrl ?? `https://www.google.com/maps/place/?q=place_id:${item.googlePlaceId}`,
          websiteUrl: item.website,
          latitude: item.latitude,
          longitude: item.longitude,
          distanceMeters,
          primaryPhone: item.phone,
        },
        create: {
          locationId: input.locationId,
          googlePlaceId: item.googlePlaceId,
          name: item.name,
          address: item.address,
          category: item.category,
          source: env.GOOGLE_MAPS_API_KEY ? "google_places_api" : "mock_places",
          googleMapsUrl: item.googleMapsUrl ?? `https://www.google.com/maps/place/?q=place_id:${item.googlePlaceId}`,
          websiteUrl: item.website,
          latitude: item.latitude,
          longitude: item.longitude,
          distanceMeters,
          primaryPhone: item.phone,
        },
      });

      if (item.phone) {
        await prisma.contact.upsert({
          where: {
            businessId_kind_value: {
              businessId: business.id,
              kind: "PHONE",
              value: item.phone,
            },
          },
          update: {
            normalizedValue: normalizePhone(item.phone),
            source: business.source,
            confidenceScore: 70,
          },
          create: {
            businessId: business.id,
            kind: "PHONE",
            value: item.phone,
            normalizedValue: normalizePhone(item.phone),
            source: business.source,
            confidenceScore: 70,
          },
        });
      }

      upserts.push(business);
  }

  return upserts;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function extractEmailsFromText(text: string) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z])/gi) ?? [];
  return uniqueStrings(
    matches
      .map((value) => value.trim().toLowerCase().replace(/[),.;:]+$/g, ""))
      .filter((value) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)),
  );
}

function extractNormalizedPhonesFromText(text: string) {
  const matches = text.match(/(?:\+?1[\s().-]*)?(?:\(?\d{3}\)?[\s().-]*)\d{3}[\s.-]*\d{4}/g) ?? [];
  return uniqueStrings(
    matches
      .map((value) => value.replace(/\D/g, ""))
      .map((digits) => {
        if (digits.length === 10) {
          return `+1${digits}`;
        }

        if (digits.length === 11 && digits.startsWith("1")) {
          return `+${digits}`;
        }

        return null;
      })
      .filter((value): value is string => Boolean(value)),
  );
}

function extractNormalizedPhonesFromLinks(values: string[]) {
  return extractNormalizedPhonesFromText(values.join(" "));
}

function isLikelyValidPublicEmail(email: string, websiteHost: string) {
  const [, domain = ""] = email.toLowerCase().split("@");
  const normalizedDomain = domain.trim();
  const normalizedWebsiteHost = normalizeWebsiteHost(websiteHost);

  if (!normalizedDomain) {
    return false;
  }

  if (
    normalizedDomain.startsWith(normalizedWebsiteHost) &&
    normalizedDomain !== normalizedWebsiteHost &&
    !normalizedDomain.startsWith(`${normalizedWebsiteHost}.`)
  ) {
    return false;
  }

  return true;
}

function normalizeWebsiteHost(hostname: string) {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function isSameWebsiteHost(candidateUrl: URL, expectedHost: string) {
  return normalizeWebsiteHost(candidateUrl.hostname) === normalizeWebsiteHost(expectedHost);
}

function isRelevantPublicLink(href: string, label: string) {
  const candidate = `${href} ${label}`.toLowerCase();
  return [
    "contact",
    "contact-us",
    "get-in-touch",
    "reach-us",
    "about",
    "company",
    "office",
    "location",
    "support",
    "help",
    "team",
    "staff",
    "directory",
    "connect",
    "book",
    "consult",
    "request",
    "quote",
    "appointment",
    "meet",
  ].some((keyword) => candidate.includes(keyword));
}

function collectCandidatePages(
  websiteHost: string,
  websiteUrl: string,
  html: string,
  $: cheerio.CheerioAPI,
) {
  const parsedWebsiteUrl = new URL(websiteUrl);
  const rootUrl = `${parsedWebsiteUrl.protocol}//${parsedWebsiteUrl.host}`;
  const initialPages = [
    ...PUBLIC_PATHS.map((path) => new URL(path, rootUrl).toString()),
    "/contact-us",
    "/contact-us/",
    "/contact-us.php",
    "/contact.php",
    "/contactus",
    "/contactus/",
    "/about-us",
    "/about-us/",
    "/team",
    "/team/",
    "/our-team",
    "/locations",
    "/support",
    "/get-in-touch",
    "/request-consultation",
    "/book-consultation",
    "/sitemap.php",
  ].map((path) => new URL(path, rootUrl).toString());
  const linkPages = $("a[href]")
    .map((_, element) => {
      const href = $(element).attr("href")?.trim();
      const label = $(element).text().trim();
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return null;
      }

      try {
        const resolved = new URL(href, websiteUrl);
        if (!isSameWebsiteHost(resolved, websiteHost)) {
          return null;
        }
        if (!isRelevantPublicLink(resolved.pathname, label)) {
          return null;
        }
        return resolved.toString();
      } catch {
        return null;
      }
    })
    .get()
    .filter((value): value is string => Boolean(value));

  const inlineMatches = html.match(/https?:\/\/[^\s"')<>]+/gi) ?? [];
  const inlinePages = inlineMatches
    .map((value) => {
      try {
        const resolved = new URL(value);
        if (!isSameWebsiteHost(resolved, websiteHost) || !isRelevantPublicLink(resolved.pathname, resolved.pathname)) {
          return null;
        }
        return resolved.toString();
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));

  const prioritized = uniqueStrings([websiteUrl, ...initialPages, ...linkPages, ...inlinePages]);
  return prioritized
    .sort((left, right) => {
      const leftScore = left.toLowerCase().includes("contact") ? 3 : left.toLowerCase().includes("about") ? 2 : 1;
      const rightScore = right.toLowerCase().includes("contact") ? 3 : right.toLowerCase().includes("about") ? 2 : 1;
      return rightScore - leftScore;
    })
    .slice(0, 20);
}

export async function enrichBusinessContacts(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!business) {
    throw new Error("Lead not found.");
  }

  if (!business.websiteUrl) {
    return { createdContacts: 0, skipped: true };
  }

  const websiteUrl = new URL(business.websiteUrl);
  const websiteHost = websiteUrl.hostname;
  const genericEmails = new Map<string, { score: number; pageUrl: string }>();
  const phones = new Map<string, { score: number; pageUrl: string }>();
  const pagesToVisit = uniqueStrings([
    business.websiteUrl,
    ...PUBLIC_PATHS.map((path) => new URL(path, websiteUrl.origin).toString()),
  ]);
  const queuedPages = new Set(pagesToVisit);
  const visitedPages = new Set<string>();

  while (pagesToVisit.length > 0 && visitedPages.size < 20) {
    const pageUrl = pagesToVisit.shift();
    if (!pageUrl || visitedPages.has(pageUrl)) {
      continue;
    }

    visitedPages.add(pageUrl);

    try {
      const response = await fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const candidatePages = collectCandidatePages(websiteHost, business.websiteUrl, html, $);
      for (const candidatePage of candidatePages) {
        if (queuedPages.has(candidatePage) || visitedPages.has(candidatePage)) {
          continue;
        }

        queuedPages.add(candidatePage);
        pagesToVisit.push(candidatePage);
      }
      const visibleText = $("body").text();
      const mailtoLinks = $("a[href^='mailto:']")
        .map((_, element) => $(element).attr("href")?.replace(/^mailto:/i, "") ?? "")
        .get();
      const telLinks = $("a[href^='tel:']")
        .map((_, element) => $(element).attr("href")?.replace(/^tel:/i, "") ?? "")
        .get();

      const foundEmails = extractEmailsFromText(visibleText);
      for (const rawEmail of uniqueStrings([...foundEmails, ...mailtoLinks])) {
        const email = rawEmail.trim().toLowerCase().replace(/[),.;:]+$/g, "");
        if (!isGenericBusinessEmail(email) || !isLikelyValidPublicEmail(email, websiteHost)) {
          continue;
        }
        genericEmails.set(email, {
          score: pageUrl.includes("contact") ? 92 : 78,
          pageUrl,
        });
      }

      const foundPhones = extractNormalizedPhonesFromLinks(telLinks);
      for (const normalizedPhone of foundPhones) {
        phones.set(normalizedPhone, {
          score: pageUrl.includes("contact") ? 80 : 68,
          pageUrl,
        });
      }
    } catch {
      continue;
    }
  }

  let createdContacts = 0;

  if (genericEmails.size > 0 || phones.size > 0) {
    const existingWebsiteContacts = await prisma.contact.findMany({
      where: {
        businessId,
        source: "website_public_pages",
      },
      select: {
        id: true,
        kind: true,
        value: true,
      },
    });

    const staleWebsiteContactIds = existingWebsiteContacts
      .filter((contact) => {
        if (contact.kind === "EMAIL") {
          return !genericEmails.has(contact.value.toLowerCase());
        }

        if (contact.kind === "PHONE") {
          return !phones.has(contact.value);
        }

        return false;
      })
      .map((contact) => contact.id);

    if (staleWebsiteContactIds.length > 0) {
      await prisma.contact.deleteMany({
        where: {
          id: {
            in: staleWebsiteContactIds,
          },
        },
      });
    }
  }

  for (const [email, details] of genericEmails.entries()) {
    await prisma.contact.upsert({
      where: {
        businessId_kind_value: {
          businessId,
          kind: "EMAIL",
          value: email,
        },
      },
      update: {
        normalizedValue: email,
        source: "website_public_pages",
        pageUrl: details.pageUrl,
        confidenceScore: details.score,
        isGeneric: true,
      },
      create: {
        businessId,
        kind: "EMAIL",
        value: email,
        normalizedValue: email,
        source: "website_public_pages",
        pageUrl: details.pageUrl,
        confidenceScore: details.score,
        isGeneric: true,
      },
    });
    createdContacts += 1;
  }

  for (const [phone, details] of phones.entries()) {
    if (!phone.startsWith("+")) {
      continue;
    }

    await prisma.contact.upsert({
      where: {
        businessId_kind_value: {
          businessId,
          kind: "PHONE",
          value: phone,
        },
      },
      update: {
        normalizedValue: phone,
        source: "website_public_pages",
        pageUrl: details.pageUrl,
        confidenceScore: details.score,
      },
      create: {
        businessId,
        kind: "PHONE",
        value: phone,
        normalizedValue: phone,
        source: "website_public_pages",
        pageUrl: details.pageUrl,
        confidenceScore: details.score,
      },
    });
  }

  const primaryEmail = Array.from(genericEmails.keys())[0] ?? business.primaryEmail;
  const primaryPhone = Array.from(phones.keys()).find((value) => value.startsWith("+")) ?? business.primaryPhone;

  await prisma.business.update({
    where: { id: businessId },
    data: {
      primaryEmail,
      primaryPhone,
    },
  });

  return { createdContacts, skipped: false };
}

export async function enrichBusinessContactsBatch(businessIds: string[]) {
  const uniqueBusinessIds = uniqueStrings(businessIds).filter(Boolean);
  const results = [] as Array<{ businessId: string; createdContacts: number; skipped: boolean; error?: string }>;

  for (const businessId of uniqueBusinessIds) {
    try {
      const result = await enrichBusinessContacts(businessId);
      results.push({ businessId, ...result });
    } catch (error) {
      results.push({
        businessId,
        createdContacts: 0,
        skipped: false,
        error: error instanceof Error ? error.message : "Unable to enrich contact",
      });
    }
  }

  return {
    processed: results.length,
    enriched: results.filter((result) => result.createdContacts > 0).length,
    createdContacts: results.reduce((total, result) => total + result.createdContacts, 0),
    results,
  };
}

export async function getLeadRows(filters: {
  hasEmail?: boolean;
  hasPhone?: boolean;
  category?: string;
  maxDistance?: number;
  validationStatus?: ValidationStatus;
}) {
  const businesses = await prisma.business.findMany({
    where: {
      category: filters.category || undefined,
      validationStatus: filters.validationStatus || undefined,
      distanceMeters: filters.maxDistance ? { lte: filters.maxDistance } : undefined,
    },
    include: {
      contacts: {
        orderBy: { confidenceScore: "desc" },
      },
    },
    orderBy: [{ validationStatus: "asc" }, { distanceMeters: "asc" }, { name: "asc" }],
  });

  return businesses
    .map((business) => {
      const emailContact =
        business.contacts.find((contact) => contact.kind === "EMAIL" && contact.isGeneric) ??
        business.contacts.find((contact) => contact.kind === "EMAIL");
      const phoneContact = business.contacts.find((contact) => contact.kind === "PHONE");

      return {
        id: business.id,
        name: business.name,
        address: business.address,
        category: business.category,
        source: business.source,
        websiteUrl: business.websiteUrl,
        googleMapsUrl: business.googleMapsUrl,
        distanceMeters: business.distanceMeters,
        validationStatus: business.validationStatus,
        notes: business.notes,
        primaryEmail: emailContact?.value ?? business.primaryEmail,
        primaryPhone: phoneContact?.value ?? business.primaryPhone,
        whatsappEligible: business.whatsappEligible,
        hasPriorRelation: business.hasPriorRelation,
        contacts: business.contacts,
      };
    })
    .filter((row) => (filters.hasEmail ? Boolean(row.primaryEmail) : true))
    .filter((row) => (filters.hasPhone ? Boolean(row.primaryPhone) : true));
}

export async function createOrUpdateCampaignRecipient(input: {
  campaignId: string;
  businessId: string;
  contactId?: string;
  channel: Channel;
  destination: string;
  dryRun: boolean;
  status?: RecipientStatus;
  providerId?: string;
  error?: string;
}) {
  return prisma.campaignRecipient.upsert({
    where: {
      campaignId_businessId_channel_destination: {
        campaignId: input.campaignId,
        businessId: input.businessId,
        channel: input.channel,
        destination: input.destination,
      },
    },
    update: {
      contactId: input.contactId,
      dryRun: input.dryRun,
      status: input.status,
      sentAt: input.status === RecipientStatus.SENT ? new Date() : undefined,
      providerId: input.providerId,
      lastError: input.error,
    },
    create: {
      campaignId: input.campaignId,
      businessId: input.businessId,
      contactId: input.contactId,
      channel: input.channel,
      destination: input.destination,
      dryRun: input.dryRun,
      status: input.status ?? RecipientStatus.PENDING,
      sentAt: input.status === RecipientStatus.SENT ? new Date() : undefined,
      providerId: input.providerId,
      lastError: input.error,
    },
  });
}

export async function previewCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  // Include APPROVED leads plus previously-contacted customers who hold explicit
  // marketing opt-in, so consented customers stay reachable for follow-up sends.
  const approvedBusinesses = await prisma.business.findMany({
    where: {
      OR: [
        { validationStatus: ValidationStatus.APPROVED },
        {
          validationStatus: ValidationStatus.CONTACTED,
          contacts: { some: { hasOptIn: true } },
        },
      ],
    },
    include: {
      contacts: true,
    },
  });

  const optOutEmails = new Set(
    (
      await prisma.optOut.findMany({
        where: { channel: Channel.EMAIL, email: { not: null } },
      })
    )
      .map((record) => record.email)
      .filter((value): value is string => Boolean(value)),
  );

  const optOutPhones = new Set(
    (
      await prisma.optOut.findMany({
        where: { channel: Channel.WHATSAPP, phone: { not: null } },
      })
    )
      .map((record) => record.phone)
      .filter((value): value is string => Boolean(value)),
  );

  const emailRecipients = approvedBusinesses
    .map((business) => {
      const contact =
        business.contacts.find((item) => item.kind === "EMAIL" && item.isGeneric) ??
        business.contacts.find((item) => item.kind === "EMAIL" && item.hasOptIn);
      const destination = contact?.value ?? business.primaryEmail ?? "";
      return { business, contact, destination };
    })
    .filter((item) => Boolean(item.destination) && !optOutEmails.has(item.destination));

  const whatsappRecipients = approvedBusinesses
    .map((business) => {
      const contact = business.contacts.find(
        (item) => item.kind === "PHONE" && item.whatsappEligible && item.hasOptIn,
      );
      const destination = contact?.normalizedValue ?? "";
      return { business, contact, destination };
    })
    .filter(
      (item) =>
        Boolean(item.destination) &&
        (item.business.whatsappEligible || item.business.hasPriorRelation) &&
        !optOutPhones.has(item.destination),
    );

  const variables = {
    business_name: emailRecipients[0]?.business.name ?? "Local Business",
    restaurant_name: campaign.restaurantName,
    offer: campaign.offer ?? "Ask for our latest office lunch offer",
    address: campaign.restaurantAddress,
    phone: campaign.restaurantPhone,
    order_link: campaign.restaurantWebsite ?? campaign.restaurantAddress,
  };

  const complianceChecklist = [
    { label: "Only approved leads or opted-in customers included", passed: true },
    { label: "Emails limited to public inboxes or opted-in customers", passed: true },
    { label: "Email unsubscribe handling enabled", passed: true },
    {
      label: "WhatsApp recipients have opt-in or prior relationship",
      passed: whatsappRecipients.every((item) => item.contact?.hasOptIn || item.business.hasPriorRelation),
    },
  ];

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "READY", lastPreviewedAt: new Date() },
  });

  return {
    campaign,
    emailRecipients,
    whatsappRecipients,
    complianceChecklist,
    emailPreview: {
      subject: renderTemplate(campaign.emailSubject, variables),
      body: renderTemplate(campaign.emailBody, variables),
      posterImageUrl: campaign.posterImageUrl,
    },
    whatsappPreview: buildWhatsAppOfferMessage(campaign.whatsappBody, variables),
  };
}

async function buildTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEmailHtml(body: string, posterImageUrl?: string | null, posterAlt?: string) {
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style=\"margin:0 0 16px; line-height:1.65; color:#3b342f;\">${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
  const posterMarkup = posterImageUrl
    ? `<div style=\"margin:0 0 24px;\"><img src=\"${escapeHtml(posterImageUrl)}\" alt=\"${escapeHtml(
        posterAlt ?? "Campaign poster",
      )}\" style=\"display:block; width:100%; max-width:640px; border-radius:18px; border:1px solid #eadfd5;\" /></div>`
    : "";

  return `<!doctype html><html><body style=\"margin:0; background:#f6efe7; padding:24px; font-family:Segoe UI, Arial, sans-serif;\"><div style=\"margin:0 auto; max-width:680px; background:#ffffff; border-radius:24px; padding:28px;\">${posterMarkup}${paragraphs}</div></body></html>`;
}

function buildWhatsAppOfferMessage(template: string, variables: Record<string, string | undefined>) {
  const rendered = renderTemplate(template, variables).replace(/\s+/g, " ").trim();

  if (rendered.length <= 180) {
    return rendered;
  }

  const shortened = rendered.slice(0, 177);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 80 ? lastSpace : shortened.length).trim()}...`;
}

async function uploadWhatsAppMediaFromDataUrl(dataUrl: string): Promise<string | undefined> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return undefined;
  }

  const [, contentType, base64Payload] = match;
  const buffer = Buffer.from(base64Payload, "base64");
  const extension = contentType.split("/").at(-1) ?? "png";

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", contentType);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), `campaign-poster.${extension}`);

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${env.META_WHATSAPP_PHONE_NUMBER_ID}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.META_WHATSAPP_ACCESS_TOKEN}` },
      body: form,
    },
  );

  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "WhatsApp media upload failed");
  }

  return payload.id;
}

// Resolves the campaign poster into a WhatsApp-compatible media reference.
// Public http(s) URLs are sent as links; uploaded (base64) images are pushed to
// Meta's media endpoint and referenced by id. Returns undefined when there is no
// usable image, in which case callers fall back to a plain text message.
async function resolveWhatsAppMediaReference(
  posterImageUrl?: string | null,
): Promise<{ link: string } | { id: string } | undefined> {
  if (!posterImageUrl) {
    return undefined;
  }

  if (posterImageUrl.startsWith("data:image/")) {
    const mediaId = await uploadWhatsAppMediaFromDataUrl(posterImageUrl);
    return mediaId ? { id: mediaId } : undefined;
  }

  try {
    const parsed = new URL(posterImageUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { link: posterImageUrl };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

// Builds the Meta Cloud API message payload for a single WhatsApp recipient.
// When META_WHATSAPP_TEMPLATE_NAME is configured, an approved message template
// is used so the send works for cold / business-initiated contacts (outside the
// 24h customer service window). The registered template is expected to have an
// optional image header and a single body variable ({{1}}) that receives the
// rendered offer text. Without a configured template name, the legacy free-form
// text/image payload is used (only valid inside the 24h window).
function buildWhatsAppMessagePayload(
  destination: string,
  bodyText: string,
  mediaRef: { link: string } | { id: string } | undefined,
) {
  const templateName = env.META_WHATSAPP_TEMPLATE_NAME?.trim();

  if (templateName) {
    const components: Array<Record<string, unknown>> = [];

    if (mediaRef) {
      components.push({
        type: "header",
        parameters: [{ type: "image", image: mediaRef }],
      });
    }

    components.push({
      type: "body",
      parameters: [{ type: "text", text: bodyText }],
    });

    return {
      messaging_product: "whatsapp",
      to: destination,
      type: "template",
      template: {
        name: templateName,
        language: { code: env.META_WHATSAPP_TEMPLATE_LANGUAGE },
        components,
      },
    };
  }

  return mediaRef
    ? {
        messaging_product: "whatsapp",
        to: destination,
        type: "image",
        image: { ...mediaRef, caption: bodyText },
      }
    : {
        messaging_product: "whatsapp",
        to: destination,
        type: "text",
        text: { body: bodyText },
      };
}

function buildPosterAttachment(posterImageUrl?: string | null, posterImageName?: string | null) {
  if (!posterImageUrl) {
    return undefined;
  }

  if (posterImageUrl.startsWith("data:image/")) {
    const match = posterImageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return undefined;
    }

    const [, contentType, base64Payload] = match;
    const extension = contentType.split("/").at(-1) ?? "png";
    return {
      filename: posterImageName || `campaign-poster.${extension}`,
      content: Buffer.from(base64Payload, "base64"),
      contentType,
      cid: "campaign-poster-inline",
    };
  }

  try {
    const parsed = new URL(posterImageUrl);
    const filename = posterImageName || parsed.pathname.split("/").filter(Boolean).at(-1) || "campaign-poster";
    return {
      filename,
      path: posterImageUrl,
    };
  } catch {
    return undefined;
  }
}

function resolvePosterImageSource(
  posterImageUrl?: string | null,
  posterAttachment?: { cid?: string },
) {
  if (!posterImageUrl) {
    return undefined;
  }

  if (posterImageUrl.startsWith("data:image/") && posterAttachment?.cid) {
    return `cid:${posterAttachment.cid}`;
  }

  return posterImageUrl;
}

function buildCampaignTemplateVariables(campaign: {
  restaurantName: string;
  offer?: string | null;
  restaurantAddress: string;
  restaurantPhone: string;
  restaurantWebsite?: string | null;
}, businessName: string) {
  return {
    business_name: businessName,
    restaurant_name: campaign.restaurantName,
    offer: campaign.offer ?? "Ask for our latest lunch offer",
    address: campaign.restaurantAddress,
    phone: campaign.restaurantPhone,
    order_link: campaign.restaurantWebsite ?? campaign.restaurantAddress,
  };
}

async function getCampaignForSend(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  return campaign;
}

export async function sendCampaignTestEmail(input: {
  campaignId: string;
  email: string;
  dryRun: boolean;
  businessName?: string;
}) {
  const campaign = await getCampaignForSend(input.campaignId);
  const transporter = await buildTransporter();
  const provider = env.EMAIL_PROVIDER;
  const businessName = input.businessName?.trim() || "Test Business";
  const variables = buildCampaignTemplateVariables(campaign, businessName);
  const emailBody = renderTemplate(campaign.emailBody, variables);
  const posterAttachment = buildPosterAttachment(campaign.posterImageUrl, campaign.posterImageName);
  const emailHtml = renderEmailHtml(
    emailBody,
    resolvePosterImageSource(campaign.posterImageUrl, posterAttachment),
    `${campaign.restaurantName} offer poster`,
  );

  let status: MessageLogStatus = input.dryRun ? MessageLogStatus.DRY_RUN : MessageLogStatus.SENT;
  let responseBody = "dry-run";
  let error: string | undefined;

  try {
    if (!input.dryRun) {
      if (!env.SMTP_HOST) {
        throw new Error("SMTP is not configured for live email sends.");
      }

      const info = await transporter.sendMail({
        from: env.SMTP_FROM,
        to: input.email,
        subject: renderTemplate(campaign.emailSubject, variables),
        text: emailBody,
        html: emailHtml,
        attachments: posterAttachment ? [posterAttachment] : undefined,
      });
      responseBody = serializeJson(info);
    }
  } catch (caught) {
    status = MessageLogStatus.FAILED;
    error = caught instanceof Error ? caught.message : "Unknown email delivery error";
    responseBody = error;
  }

  await prisma.messageLog.create({
    data: {
      campaignId: campaign.id,
      channel: Channel.EMAIL,
      destination: input.email,
      status,
      provider,
      requestBody: serializeJson({ dryRun: input.dryRun, body: emailBody, businessName, testSend: true }),
      responseBody,
      error,
      metadata: serializeJson({ testSend: true, posterImageUrl: campaign.posterImageUrl }),
    },
  });

  return { destination: input.email, status, error };
}

export async function sendCampaignTestWhatsApp(input: {
  campaignId: string;
  phone: string;
  dryRun: boolean;
  businessName?: string;
}) {
  const campaign = await getCampaignForSend(input.campaignId);
  const provider = "meta_whatsapp_cloud_api";
  const businessName = input.businessName?.trim() || "Test Business";
  const destination = normalizePhone(input.phone);
  const bodyText = buildWhatsAppOfferMessage(
    campaign.whatsappBody,
    buildCampaignTemplateVariables(campaign, businessName),
  );

  let status: MessageLogStatus = input.dryRun ? MessageLogStatus.DRY_RUN : MessageLogStatus.SENT;
  let responseBody = "dry-run";
  let providerId: string | undefined;
  let error: string | undefined;

  try {
    if (!input.dryRun) {
      if (!env.META_WHATSAPP_ACCESS_TOKEN || !env.META_WHATSAPP_PHONE_NUMBER_ID) {
        throw new Error("Meta WhatsApp Cloud API is not configured for live sends.");
      }

      const mediaRef = await resolveWhatsAppMediaReference(campaign.posterImageUrl);
      const messagePayload = buildWhatsAppMessagePayload(destination, bodyText, mediaRef);

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.META_WHATSAPP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messagePayload),
        },
      );
      const payload = await response.json();
      responseBody = serializeJson(payload);
      providerId = payload.messages?.[0]?.id;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "WhatsApp send failed");
      }
    }
  } catch (caught) {
    status = MessageLogStatus.FAILED;
    error = caught instanceof Error ? caught.message : "Unknown WhatsApp delivery error";
    responseBody = error;
  }

  await prisma.messageLog.create({
    data: {
      campaignId: campaign.id,
      channel: Channel.WHATSAPP,
      destination,
      status,
      provider,
      providerId,
      requestBody: serializeJson({ bodyText, dryRun: input.dryRun, businessName, testSend: true }),
      responseBody,
      error,
      metadata: serializeJson({ testSend: true, bypassedLeadEligibility: true }),
    },
  });

  return { destination, status, error };
}

// Sends a single SMS/MMS through the configured provider (SMS_PROVIDER). Returns
// the provider message id and raw response body, and throws on a non-OK response
// so callers can mark the send as FAILED. Passing one or more publicly reachable
// mediaUrls turns the message into an MMS. Telnyx is the default (lower
// per-message cost); Twilio remains available as a drop-in alternative.
async function dispatchSms(
  destination: string,
  bodyText: string,
  mediaUrls?: string[],
): Promise<{ providerId?: string; responseBody: string }> {
  if (env.SMS_PROVIDER === "telnyx") {
    if (!env.TELNYX_API_KEY || !(env.TELNYX_FROM_NUMBER || env.TELNYX_MESSAGING_PROFILE_ID)) {
      throw new Error(
        "Telnyx SMS is not configured for live sends. Set TELNYX_API_KEY and TELNYX_FROM_NUMBER (or TELNYX_MESSAGING_PROFILE_ID).",
      );
    }

    const requestBody: Record<string, unknown> = {
      to: destination,
      text: bodyText,
    };
    if (env.TELNYX_FROM_NUMBER) {
      requestBody.from = env.TELNYX_FROM_NUMBER;
    }
    if (env.TELNYX_MESSAGING_PROFILE_ID) {
      requestBody.messaging_profile_id = env.TELNYX_MESSAGING_PROFILE_ID;
    }
    if (mediaUrls && mediaUrls.length > 0) {
      requestBody.media_urls = mediaUrls;
    }

    const response = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.errors?.[0]?.detail ?? "SMS send failed");
    }
    return { providerId: payload.data?.id, responseBody: serializeJson(payload) };
  }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    throw new Error("Twilio SMS is not configured for live sends.");
  }

  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const form = new URLSearchParams({
    To: destination,
    From: env.TWILIO_FROM_NUMBER,
    Body: bodyText,
  });
  for (const url of mediaUrls ?? []) {
    form.append("MediaUrl", url);
  }
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? "SMS send failed");
  }
  return { providerId: payload.sid, responseBody: serializeJson(payload) };
}

// Resolves a publicly reachable MMS media URL for a campaign poster. MMS
// providers fetch media over the public internet, so base64 data URLs are served
// via the app's public poster route (requires APP_BASE_URL to be a public https
// origin); already-public http(s) posters are used directly.
function resolveMmsMediaUrls(campaign: {
  id: string;
  posterImageUrl?: string | null;
}): string[] | undefined {
  const poster = campaign.posterImageUrl;
  if (!poster) {
    return undefined;
  }

  if (poster.startsWith("data:image/")) {
    return [`${env.APP_BASE_URL.replace(/\/$/, "")}/api/campaigns/${campaign.id}/poster`];
  }

  try {
    const parsed = new URL(poster);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return [poster];
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function sendCampaignTestSms(input: {
  campaignId: string;
  phone: string;
  dryRun: boolean;
  businessName?: string;
  mms?: boolean;
}) {
  const campaign = await getCampaignForSend(input.campaignId);
  const provider = env.SMS_PROVIDER === "telnyx" ? "telnyx_sms" : "twilio_sms";
  const businessName = input.businessName?.trim() || "Test Business";
  const destination = normalizePhone(input.phone);
  const bodyText = buildWhatsAppOfferMessage(
    campaign.whatsappBody,
    buildCampaignTemplateVariables(campaign, businessName),
  );
  const mediaUrls = input.mms ? resolveMmsMediaUrls(campaign) : undefined;

  let status: MessageLogStatus = input.dryRun ? MessageLogStatus.DRY_RUN : MessageLogStatus.SENT;
  let responseBody = "dry-run";
  let providerId: string | undefined;
  let error: string | undefined;

  try {
    if (!input.dryRun) {
      const result = await dispatchSms(destination, bodyText, mediaUrls);
      providerId = result.providerId;
      responseBody = result.responseBody;
    }
  } catch (caught) {
    status = MessageLogStatus.FAILED;
    error = caught instanceof Error ? caught.message : "Unknown SMS delivery error";
    responseBody = error;
  }

  return { destination, status, error, provider, providerId, responseBody, mediaUrls };
}

export async function sendCampaignEmails(campaignId: string, dryRun: boolean) {
  const preview = await previewCampaign(campaignId);
  const transporter = await buildTransporter();
  const provider = env.EMAIL_PROVIDER;

  const results = [];
  for (const item of preview.emailRecipients) {
    const unsubscribeLink = `${env.APP_BASE_URL}/api/opt-out?channel=EMAIL&email=${encodeURIComponent(
      item.destination,
    )}&campaignId=${campaignId}`;
    const emailBody = `${renderTemplate(preview.campaign.emailBody, buildCampaignTemplateVariables(preview.campaign, item.business.name))}\n\nUnsubscribe: ${unsubscribeLink}`;
    const posterAttachment = buildPosterAttachment(
      preview.campaign.posterImageUrl,
      preview.campaign.posterImageName,
    );
    const emailHtml = renderEmailHtml(
      emailBody,
      resolvePosterImageSource(preview.campaign.posterImageUrl, posterAttachment),
      `${preview.campaign.restaurantName} offer poster`,
    );

    let status: MessageLogStatus = dryRun ? MessageLogStatus.DRY_RUN : MessageLogStatus.SENT;
    let responseBody = "dry-run";
    let error: string | undefined;

    try {
      if (!dryRun && env.SMTP_HOST) {
        const info = await transporter.sendMail({
          from: env.SMTP_FROM,
          to: item.destination,
          subject: renderTemplate(preview.campaign.emailSubject, buildCampaignTemplateVariables(preview.campaign, item.business.name)),
          text: emailBody,
          html: emailHtml,
          attachments: posterAttachment ? [posterAttachment] : undefined,
        });
        responseBody = serializeJson(info);
      }
    } catch (caught) {
      status = MessageLogStatus.FAILED;
      error = caught instanceof Error ? caught.message : "Unknown email delivery error";
      responseBody = error;
    }

    const recipient = await createOrUpdateCampaignRecipient({
      campaignId,
      businessId: item.business.id,
      contactId: item.contact?.id,
      channel: Channel.EMAIL,
      destination: item.destination,
      dryRun,
      status:
        status === MessageLogStatus.FAILED
          ? RecipientStatus.FAILED
          : dryRun
            ? RecipientStatus.SKIPPED
            : RecipientStatus.SENT,
      error,
    });

    await prisma.messageLog.create({
      data: {
        campaignId,
        campaignRecipientId: recipient.id,
        channel: Channel.EMAIL,
        destination: item.destination,
        status,
        provider,
        requestBody: serializeJson({ dryRun, body: emailBody, posterImageUrl: preview.campaign.posterImageUrl }),
        responseBody,
        error,
        metadata: serializeJson({ compliance: "approved_only" }),
      },
    });

    results.push({ destination: item.destination, status, error });
  }

  if (!dryRun) {
    await prisma.business.updateMany({
      where: { id: { in: preview.emailRecipients.map((item) => item.business.id) } },
      data: { validationStatus: ValidationStatus.CONTACTED },
    });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      lastSentAt: new Date(),
      status: results.some((item) => item.status === MessageLogStatus.FAILED) ? "PARTIAL_FAILURE" : "COMPLETED",
    },
  });

  return results;
}

export async function sendCampaignWhatsApp(campaignId: string, dryRun: boolean) {
  const preview = await previewCampaign(campaignId);
  const provider = "meta_whatsapp_cloud_api";
  const results = [];

  // Resolve the poster once (uploading data URLs a single time) and reuse the
  // media reference for every recipient; only the caption changes per business.
  let mediaRef: { link: string } | { id: string } | undefined;
  if (!dryRun && env.META_WHATSAPP_ACCESS_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID) {
    try {
      mediaRef = await resolveWhatsAppMediaReference(preview.campaign.posterImageUrl);
    } catch {
      mediaRef = undefined;
    }
  }

  for (const item of preview.whatsappRecipients) {
    let status: MessageLogStatus = dryRun ? MessageLogStatus.DRY_RUN : MessageLogStatus.SENT;
    let responseBody = "dry-run";
    let providerId: string | undefined;
    let error: string | undefined;

    const bodyText = buildWhatsAppOfferMessage(preview.campaign.whatsappBody, {
      ...buildCampaignTemplateVariables(preview.campaign, item.business.name),
    });

    try {
      if (!dryRun && env.META_WHATSAPP_ACCESS_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID) {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.META_WHATSAPP_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              buildWhatsAppMessagePayload(item.destination, bodyText, mediaRef),
            ),
          },
        );
        const payload = await response.json();
        responseBody = serializeJson(payload);
        providerId = payload.messages?.[0]?.id;
        if (!response.ok) {
          throw new Error(payload.error?.message ?? "WhatsApp send failed");
        }
      }
    } catch (caught) {
      status = MessageLogStatus.FAILED;
      error = caught instanceof Error ? caught.message : "Unknown WhatsApp delivery error";
      responseBody = error;
    }

    const recipient = await createOrUpdateCampaignRecipient({
      campaignId,
      businessId: item.business.id,
      contactId: item.contact?.id,
      channel: Channel.WHATSAPP,
      destination: item.destination,
      dryRun,
      status:
        status === MessageLogStatus.FAILED
          ? RecipientStatus.FAILED
          : dryRun
            ? RecipientStatus.SKIPPED
            : RecipientStatus.SENT,
      providerId,
      error,
    });

    await prisma.messageLog.create({
      data: {
        campaignId,
        campaignRecipientId: recipient.id,
        channel: Channel.WHATSAPP,
        destination: item.destination,
        status,
        provider,
        providerId,
        requestBody: serializeJson({ bodyText, dryRun }),
        responseBody,
        error,
        metadata: serializeJson({ requiresOptIn: true }),
      },
    });

    results.push({ destination: item.destination, status, error });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      lastSentAt: new Date(),
      status: results.some((item) => item.status === MessageLogStatus.FAILED) ? "PARTIAL_FAILURE" : "COMPLETED",
    },
  });

  return results;
}

// Bulk SMS/MMS send. Consent-gated: reuses the same opted-in audience as
// WhatsApp (preview.whatsappRecipients), i.e. PHONE contacts with explicit
// opt-in only. Never targets non-consented scraped numbers. Passing mms=true
// attaches the campaign poster as MMS media (requires APP_BASE_URL to be a
// public origin so the provider can fetch it).
export async function sendCampaignSms(campaignId: string, dryRun: boolean, mms: boolean) {
  const preview = await previewCampaign(campaignId);
  const provider = env.SMS_PROVIDER === "telnyx" ? "telnyx_sms" : "twilio_sms";
  const mediaUrls = mms ? resolveMmsMediaUrls(preview.campaign) : undefined;
  const results = [];

  for (const item of preview.whatsappRecipients) {
    let status: MessageLogStatus = dryRun ? MessageLogStatus.DRY_RUN : MessageLogStatus.SENT;
    let responseBody = "dry-run";
    let providerId: string | undefined;
    let error: string | undefined;

    const bodyText = buildWhatsAppOfferMessage(preview.campaign.whatsappBody, {
      ...buildCampaignTemplateVariables(preview.campaign, item.business.name),
    });

    try {
      if (!dryRun) {
        const result = await dispatchSms(item.destination, bodyText, mediaUrls);
        providerId = result.providerId;
        responseBody = result.responseBody;
        // Light pacing to stay within provider rate limits on bulk sends.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch (caught) {
      status = MessageLogStatus.FAILED;
      error = caught instanceof Error ? caught.message : "Unknown SMS delivery error";
      responseBody = error;
    }

    const recipient = await createOrUpdateCampaignRecipient({
      campaignId,
      businessId: item.business.id,
      contactId: item.contact?.id,
      channel: Channel.SMS,
      destination: item.destination,
      dryRun,
      status:
        status === MessageLogStatus.FAILED
          ? RecipientStatus.FAILED
          : dryRun
            ? RecipientStatus.SKIPPED
            : RecipientStatus.SENT,
      providerId,
      error,
    });

    await prisma.messageLog.create({
      data: {
        campaignId,
        campaignRecipientId: recipient.id,
        channel: Channel.SMS,
        destination: item.destination,
        status,
        provider,
        providerId,
        requestBody: serializeJson({ bodyText, dryRun, mms, mediaUrls }),
        responseBody,
        error,
        metadata: serializeJson({ requiresOptIn: true, mms }),
      },
    });

    results.push({ destination: item.destination, status, error });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      lastSentAt: new Date(),
      status: results.some((item) => item.status === MessageLogStatus.FAILED) ? "PARTIAL_FAILURE" : "COMPLETED",
    },
  });

  return results;
}
