import type { MetadataRoute } from "next";
import { services } from "@/content/services";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return [
    { url: `${base}/`, priority: 1 },
    ...services.map((s) => ({ url: `${base}/poslugy/${s.slug}`, priority: 0.8 })),
    { url: `${base}/oferta`, priority: 0.2 },
    { url: `${base}/privacy`, priority: 0.2 },
  ];
}
