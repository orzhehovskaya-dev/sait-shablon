"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { track } from "@/lib/analytics";

/** Посилання, яке фіксує клік у воронці (без персональних даних) */
export function TrackLink({
  href,
  className,
  service,
  location,
  children,
  cta,
}: {
  href: string;
  className?: string;
  service?: string;
  location: string;
  children: ReactNode;
  cta?: boolean;
}) {
  return (
    <Link
      href={href}
      className={className}
      data-cta={cta ? "" : undefined}
      onClick={() => track("service_click", { service, location })}
    >
      {children}
    </Link>
  );
}
