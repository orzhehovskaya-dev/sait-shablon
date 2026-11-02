import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { site } from "@/content/site";
import { Analytics } from "@/components/Analytics";
import "./globals.css";

const display = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: site.seo.title, template: `%s — ${site.brand}` },
  description: site.seo.description,
  openGraph: {
    type: "website",
    locale: "uk_UA",
    title: site.seo.title,
    description: site.seo.description,
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
  icons: { icon: "/favicon.svg" },
  applicationName: site.brand,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0306",
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Структуровані дані для пошуковиків: хто ця людина і де її сторінки */
const personLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: site.person,
  alternateName: [site.brand],
  url: SITE,
  image: `${SITE}${site.about.photo.src}`,
  jobTitle: site.jobTitle,
  sameAs: [site.instagram, site.telegramContact],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={display.variable}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
