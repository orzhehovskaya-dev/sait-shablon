"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const GA = process.env.NEXT_PUBLIC_GA4_ID;
const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const KEY = "site_consent_v1";

/** Завантажує аналітику лише після згоди відвідувача */
export function Analytics() {
  const [consent, setConsent] = useState<"yes" | "no" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "yes" || v === "no") setConsent(v);
    } catch {
      /* приватний режим */
    }
    setReady(true);
  }, []);

  const decide = (v: "yes" | "no") => {
    setConsent(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
  };

  if (!GA && !PIXEL) return null;

  return (
    <>
      {consent === "yes" && GA && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {consent === "yes" && PIXEL && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');`}
        </Script>
      )}
      {ready && consent === null && (
        <div className="cookies" role="dialog" aria-label="Налаштування cookies">
          <p>Сайт використовує аналітичні cookies, щоб розуміти, які сторінки корисні. Персональні дані з анкет у аналітику не передаються.</p>
          <div className="cookies__row">
            <button type="button" className="btn btn--milk" onClick={() => decide("yes")}>
              Дозволити
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => decide("no")}>
              Лише необхідні
            </button>
          </div>
        </div>
      )}
    </>
  );
}
