import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BookingResult } from "@/components/BookingResult";

export const metadata: Metadata = { title: "Статус бронювання", robots: { index: false } };

export default async function ResultPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <>
      <Header />
      <main>
        <BookingResult token={t ?? ""} />
      </main>
    </>
  );
}
