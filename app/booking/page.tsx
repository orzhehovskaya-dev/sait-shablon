import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BookingFlow } from "@/components/BookingFlow";
import { getEurUah } from "@/lib/fx";

export const metadata: Metadata = { title: "Бронювання", robots: { index: false } };

export default async function BookingPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service } = await searchParams;
  const { rate } = await getEurUah();
  return (
    <>
      <Header />
      <main>
        <BookingFlow key={service ?? "none"} initialService={service} uahRate={rate} />
      </main>
    </>
  );
}
