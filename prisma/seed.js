const { PrismaClient, CampaignStatus } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const existingCampaign = await prisma.campaign.findFirst({
    where: { name: "Fresh Indian Lunch Outreach" },
  });

  if (!existingCampaign) {
    await prisma.campaign.create({
      data: {
        name: "Fresh Indian Lunch Outreach",
        emailSubject: "Special Lunch Catering Offer Near Your Office",
        emailBody:
          "Hi {{business_name}},\n\n{{restaurant_name}} is offering fresh Indian team lunches this week. {{offer}}. We can deliver to your office near {{address}}. Reply to this email or call {{phone}} to plan a tasting.\n\nOrder here: {{order_link}}",
        whatsappBody:
          "Hi {{business_name}}, {{restaurant_name}} has a fresh Indian lunch offer for nearby teams: {{offer}}. Call {{phone}} or order here {{order_link}}.",
        offer: "15% off first office catering order before Friday",
        restaurantName: "Spice Route Kitchen",
        restaurantAddress: "12 Market Street",
        restaurantPhone: "+1 555-0123",
        restaurantWebsite: "https://example-restaurant.com/order",
        status: CampaignStatus.DRAFT,
      },
    });
  }

}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
