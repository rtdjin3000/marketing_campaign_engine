import type { Metadata, Route } from "next";
import Link from "next/link";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Restaurant Outreach Engine",
  description: "Compliant nearby business discovery and campaign management for restaurants.",
};

const navItems = [
  { href: "/" as Route, label: "Lead Discovery" },
  { href: "/campaigns" as Route, label: "Campaign Builder" },
  { href: "/logs" as Route, label: "Logs & Analytics" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <div className="shell-grid">
          <aside className="border-r border-[var(--stroke)] bg-[#2c211b] px-6 py-8 text-[#f7efe4]">
            <div className="mb-10 rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="eyebrow !text-[#e6c9a5]">Restaurant Outreach</p>
              <h1 className="title-display mt-3 text-3xl font-semibold">Campaign Studio</h1>
              <p className="mt-3 text-sm leading-6 text-[#e7d9c8]">
                Discover nearby commercial leads, validate public contacts, and launch compliant promotions.
              </p>
            </div>

            <nav className="space-y-3">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-[#f7efe4] transition hover:bg-white/10"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-10 rounded-[24px] border border-[#a06a3c]/40 bg-[#f2e3cc] p-5 text-[#2c211b]">
              <p className="eyebrow text-[#6a4b2d]">Compliance</p>
              <ul className="mt-3 space-y-2 text-sm leading-6">
                <li>Manual approval required before any send.</li>
                <li>Only public business contacts are retained.</li>
                <li>WhatsApp requires opt-in or prior relationship.</li>
              </ul>
            </div>
          </aside>

          <main className="px-5 py-6 md:px-8 lg:px-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
