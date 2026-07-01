// Creates an approved-pending WhatsApp message template via the Meta Graph API.
//
// Usage (loads .env automatically with Node's --env-file):
//   node --env-file=.env scripts/create-whatsapp-template.js
//   npm run whatsapp:create-template
//
// Optional overrides:
//   --name=daily_specials            Template name (default: META_WHATSAPP_TEMPLATE_NAME or "campaign_offer")
//   --language=en_US                 Language code (default: META_WHATSAPP_TEMPLATE_LANGUAGE or "en_US")
//   --category=MARKETING             MARKETING | UTILITY (default: MARKETING)
//   --with-image-header              Add an IMAGE header (requires --header-handle)
//   --header-handle=<handle>         Resumable-upload media handle for the header example
//
// Notes:
// - Marketing templates require approval; this script submits it (status PENDING).
// - The template body has a single {{1}} variable that the app fills with the
//   rendered campaign offer text (see buildWhatsAppMessagePayload in services.ts).
// - Requires the access token to have the `whatsapp_business_management` scope and
//   META_WHATSAPP_BUSINESS_ACCOUNT_ID to be set.

const GRAPH_VERSION = "v21.0";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const [key, value] = raw.slice(2).split("=");
    args[key] = value === undefined ? true : value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const businessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !businessAccountId) {
    console.error(
      "Missing credentials. Set META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_BUSINESS_ACCOUNT_ID in .env.",
    );
    process.exit(1);
  }

  const name = (args.name || process.env.META_WHATSAPP_TEMPLATE_NAME || "campaign_offer")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  const language = (args.language || process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || "en_US").toString();
  const category = (args.category || "MARKETING").toString().toUpperCase();

  const components = [];

  if (args["with-image-header"]) {
    if (!args["header-handle"]) {
      console.error(
        "--with-image-header requires --header-handle=<handle> (upload a sample image via the resumable upload API first).",
      );
      process.exit(1);
    }
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [args["header-handle"].toString()] },
    });
  }

  components.push({
    type: "BODY",
    text: "Hi! {{1}}",
    example: {
      body_text: [["IndiaWaale Daily Specials are here - visit us or call 647-217-2175 to order."]],
    },
  });

  const payload = { name, language, category, components };

  console.log(`Creating template "${name}" (${language}, ${category})...`);

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${businessAccountId}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("Template creation failed:");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("Template submitted successfully:");
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\nNext steps:\n  1. Wait for approval (status starts as PENDING) in Meta > WhatsApp > Message Templates.\n  2. Set META_WHATSAPP_TEMPLATE_NAME="${name}" and META_WHATSAPP_TEMPLATE_LANGUAGE="${language}" in .env.\n  3. Restart the dev server, then send the campaign.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
