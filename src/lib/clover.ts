import { ContactKind, ValidationStatus } from "@prisma/client";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isGenericBusinessEmail, normalizePhone } from "@/lib/utils";

type CloverElements<T> = { elements?: T[]; href?: string };

type CloverEmail = { emailAddress?: string };
type CloverPhone = { phoneNumber?: string };
type CloverAddress = {
  address1?: string;
  address2?: string;
  address3?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

type CloverCustomer = {
  id: string;
  firstName?: string;
  lastName?: string;
  marketingAllowed?: boolean;
  emailAddresses?: CloverElements<CloverEmail>;
  phoneNumbers?: CloverElements<CloverPhone>;
  addresses?: CloverElements<CloverAddress>;
};

type CloverCustomersResponse = {
  elements?: CloverCustomer[];
  href?: string;
};

export type CloverImportSummary = {
  fetched: number;
  createdBusinesses: number;
  updatedBusinesses: number;
  emailsLinked: number;
  phonesLinked: number;
  skipped: number;
};

function ensureCloverConfig() {
  if (!env.CLOVER_MERCHANT_ID || !env.CLOVER_API_TOKEN) {
    throw new Error(
      "Clover is not configured. Set CLOVER_MERCHANT_ID and CLOVER_API_TOKEN in your .env file.",
    );
  }
  return {
    merchantId: env.CLOVER_MERCHANT_ID,
    token: env.CLOVER_API_TOKEN,
    baseUrl: env.CLOVER_API_BASE_URL.replace(/\/$/, ""),
  };
}

export async function fetchCloverCustomers(): Promise<CloverCustomer[]> {
  const { merchantId, token, baseUrl } = ensureCloverConfig();

  const customers: CloverCustomer[] = [];
  const pageSize = 1000;
  let offset = 0;
  // Cap pages defensively to avoid runaway loops.
  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`${baseUrl}/v3/merchants/${merchantId}/customers`);
    url.searchParams.set("expand", "emailAddresses,phoneNumbers,addresses");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Clover API error ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as CloverCustomersResponse;
    const batch = payload.elements ?? [];
    customers.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return customers;
}

function buildCustomerName(customer: CloverCustomer): string {
  const name = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim();
  return name || `Clover customer ${customer.id}`;
}

function buildAddress(customer: CloverCustomer): string {
  const address = customer.addresses?.elements?.[0];
  if (!address) return "Address on file with Clover";
  const parts = [
    address.address1,
    address.address2,
    address.address3,
    address.city,
    address.state,
    address.zip,
    address.country,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(", ") : "Address on file with Clover";
}

export async function importCloverCustomers(): Promise<CloverImportSummary> {
  const customers = await fetchCloverCustomers();

  const summary: CloverImportSummary = {
    fetched: customers.length,
    createdBusinesses: 0,
    updatedBusinesses: 0,
    emailsLinked: 0,
    phonesLinked: 0,
    skipped: 0,
  };

  for (const customer of customers) {
    const emails = (customer.emailAddresses?.elements ?? [])
      .map((entry) => entry.emailAddress?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value));
    const phones = (customer.phoneNumbers?.elements ?? [])
      .map((entry) => normalizePhone(entry.phoneNumber ?? ""))
      .filter((value): value is string => Boolean(value));

    if (emails.length === 0 && phones.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const placeKey = `clover:${customer.id}`;
    const name = buildCustomerName(customer);
    const address = buildAddress(customer);
    const primaryEmail = emails[0] ?? null;
    const primaryPhone = phones[0] ?? null;
    const whatsappEligible = Boolean(customer.marketingAllowed);

    const existing = await prisma.business.findUnique({ where: { googlePlaceId: placeKey } });

    const business = await prisma.business.upsert({
      where: { googlePlaceId: placeKey },
      update: {
        name,
        address,
        primaryEmail: primaryEmail ?? existing?.primaryEmail ?? null,
        primaryPhone: primaryPhone ?? existing?.primaryPhone ?? null,
        whatsappEligible,
        hasPriorRelation: true,
        validationStatus: existing?.validationStatus ?? ValidationStatus.APPROVED,
        source: "clover",
        notes: existing?.notes ?? "Imported from Clover customer list.",
      },
      create: {
        googlePlaceId: placeKey,
        name,
        address,
        category: "Existing customer",
        source: "clover",
        primaryEmail,
        primaryPhone,
        whatsappEligible,
        hasPriorRelation: true,
        validationStatus: ValidationStatus.APPROVED,
        notes: "Imported from Clover customer list.",
      },
    });

    if (existing) summary.updatedBusinesses += 1;
    else summary.createdBusinesses += 1;

    for (const email of emails) {
      const created = await prisma.contact.upsert({
        where: {
          businessId_kind_value: {
            businessId: business.id,
            kind: ContactKind.EMAIL,
            value: email,
          },
        },
        update: {
          normalizedValue: email,
          source: "clover",
          confidenceScore: 95,
          isPublic: false,
          isGeneric: isGenericBusinessEmail(email),
          hasOptIn: whatsappEligible,
        },
        create: {
          businessId: business.id,
          kind: ContactKind.EMAIL,
          value: email,
          normalizedValue: email,
          source: "clover",
          confidenceScore: 95,
          isPublic: false,
          isGeneric: isGenericBusinessEmail(email),
          hasOptIn: whatsappEligible,
        },
      });
      if (created) summary.emailsLinked += 1;
    }

    for (const phone of phones) {
      const created = await prisma.contact.upsert({
        where: {
          businessId_kind_value: {
            businessId: business.id,
            kind: ContactKind.PHONE,
            value: phone,
          },
        },
        update: {
          normalizedValue: phone,
          source: "clover",
          confidenceScore: 95,
          isPublic: false,
          whatsappEligible,
          hasOptIn: whatsappEligible,
        },
        create: {
          businessId: business.id,
          kind: ContactKind.PHONE,
          value: phone,
          normalizedValue: phone,
          source: "clover",
          confidenceScore: 95,
          isPublic: false,
          whatsappEligible,
          hasOptIn: whatsappEligible,
        },
      });
      if (created) summary.phonesLinked += 1;
    }
  }

  return summary;
}
