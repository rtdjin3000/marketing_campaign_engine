import { NextRequest, NextResponse } from "next/server";
import { ContactKind, ValidationStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { isGenericBusinessEmail, normalizePhone } from "@/lib/utils";

const schema = z.object({
  primaryEmail: z.string().email().optional().or(z.literal("")),
  primaryPhone: z.string().optional(),
  validationStatus: z.nativeEnum(ValidationStatus).optional(),
  whatsappEligible: z.boolean().optional(),
  hasPriorRelation: z.boolean().optional(),
  hasOptIn: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());

    if (input.primaryEmail && !isGenericBusinessEmail(input.primaryEmail)) {
      return NextResponse.json(
        { error: "Only generic public business emails can be saved." },
        { status: 400 },
      );
    }

    const updated = await prisma.business.update({
      where: { id },
      data: {
        primaryEmail: input.primaryEmail || null,
        primaryPhone: input.primaryPhone || null,
        validationStatus: input.validationStatus,
        whatsappEligible: input.whatsappEligible,
        hasPriorRelation: input.hasPriorRelation,
        notes: input.notes,
      },
    });

    if (input.primaryEmail) {
      await prisma.contact.upsert({
        where: {
          businessId_kind_value: {
            businessId: id,
            kind: ContactKind.EMAIL,
            value: input.primaryEmail,
          },
        },
        update: {
          normalizedValue: input.primaryEmail.toLowerCase(),
          isGeneric: true,
          hasOptIn: false,
          source: "manual_review",
          confidenceScore: 95,
        },
        create: {
          businessId: id,
          kind: ContactKind.EMAIL,
          value: input.primaryEmail,
          normalizedValue: input.primaryEmail.toLowerCase(),
          isGeneric: true,
          hasOptIn: false,
          source: "manual_review",
          confidenceScore: 95,
        },
      });
    }

    if (input.primaryPhone) {
      const normalizedPhone = normalizePhone(input.primaryPhone);
      await prisma.contact.upsert({
        where: {
          businessId_kind_value: {
            businessId: id,
            kind: ContactKind.PHONE,
            value: normalizedPhone,
          },
        },
        update: {
          normalizedValue: normalizedPhone,
          whatsappEligible: input.whatsappEligible ?? updated.whatsappEligible,
          hasOptIn: input.hasOptIn,
          source: "manual_review",
          confidenceScore: 88,
        },
        create: {
          businessId: id,
          kind: ContactKind.PHONE,
          value: normalizedPhone,
          normalizedValue: normalizedPhone,
          whatsappEligible: input.whatsappEligible ?? updated.whatsappEligible,
          hasOptIn: input.hasOptIn ?? false,
          source: "manual_review",
          confidenceScore: 88,
        },
      });
    }

    return NextResponse.json({ lead: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update lead." },
      { status: 400 },
    );
  }
}
