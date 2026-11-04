import type { Metadata } from "next";
import Link from "next/link";
import { MODULES } from "@/lib/modules";
import "./globals.css";

export const metadata: Metadata = {
  title: "Náklo Dashboard",
  description: "Přehled Wake Surf Náklo: HR, Events, Finance, Kemp, Wakesurf, Bistro, Wakeboard",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>
        <header className="top">
          <Link href="/" className="brand" style={{ textDecoration: "none" }}>
            Náklo <span>Dashboard</span>
          </Link>
          <nav>
            {MODULES.map((m) => (
              <Link key={m.key} href={m.href} style={m.live ? undefined : { opacity: 0.55 }}>
                {m.name}
              </Link>
            ))}
            <Link href="/ukoly">Úkoly</Link>
            <Link href="/bot">Bot</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
