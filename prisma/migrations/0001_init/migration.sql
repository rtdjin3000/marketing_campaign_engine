CREATE TABLE "Location" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "label" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "latitude" REAL NOT NULL,
  "longitude" REAL NOT NULL,
  "radiusKm" REAL NOT NULL DEFAULT 5,
  "source" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Business" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "locationId" TEXT,
  "googlePlaceId" TEXT,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "googleMapsUrl" TEXT,
  "websiteUrl" TEXT,
  "latitude" REAL,
  "longitude" REAL,
  "distanceMeters" INTEGER,
  "primaryEmail" TEXT,
  "primaryPhone" TEXT,
  "whatsappEligible" BOOLEAN NOT NULL DEFAULT false,
  "hasPriorRelation" BOOLEAN NOT NULL DEFAULT false,
  "validationStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Business_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Business_googlePlaceId_key" ON "Business"("googlePlaceId");

CREATE TABLE "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT,
  "source" TEXT NOT NULL,
  "pageUrl" TEXT,
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "isGeneric" BOOLEAN NOT NULL DEFAULT false,
  "whatsappEligible" BOOLEAN NOT NULL DEFAULT false,
  "hasOptIn" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Contact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Contact_businessId_kind_value_key" ON "Contact"("businessId", "kind", "value");

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "emailSubject" TEXT NOT NULL,
  "emailBody" TEXT NOT NULL,
  "whatsappBody" TEXT NOT NULL,
  "offer" TEXT,
  "offerExpiryDate" DATETIME,
  "restaurantName" TEXT NOT NULL,
  "restaurantAddress" TEXT NOT NULL,
  "restaurantPhone" TEXT NOT NULL,
  "restaurantWebsite" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "lastPreviewedAt" DATETIME,
  "lastSentAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CampaignRecipient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "contactId" TEXT,
  "channel" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" DATETIME,
  "deliveredAt" DATETIME,
  "openedAt" DATETIME,
  "unsubscribedAt" DATETIME,
  "providerId" TEXT,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignRecipient_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CampaignRecipient_campaignId_businessId_channel_destination_key" ON "CampaignRecipient"("campaignId", "businessId", "channel", "destination");

CREATE TABLE "MessageLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaignId" TEXT,
  "campaignRecipientId" TEXT,
  "channel" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerId" TEXT,
  "requestBody" TEXT,
  "responseBody" TEXT,
  "error" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MessageLog_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "OptOut" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channel" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'user_request',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "OptOut_channel_email_key" ON "OptOut"("channel", "email");
CREATE UNIQUE INDEX "OptOut_channel_phone_key" ON "OptOut"("channel", "phone");
