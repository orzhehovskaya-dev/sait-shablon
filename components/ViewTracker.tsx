"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { getService } from "@/content/services";

export function ViewTracker({ service }: { service: string }) {
  useEffect(() => {
    const s = getService(service);
    track("view_service", { service, value: s?.priceEur, currency: "EUR" });
  }, [service]);
  return null;
}
