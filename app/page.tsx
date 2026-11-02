import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { StickyCta } from "@/components/StickyCta";
import { Hero, About, Results, Formats, Problems, Cases, Process, Reviews, Faq, FinalCta } from "@/components/sections";

/** Сторінка перебудовується щонайменше кожні 6 годин — разом з нею оновлюється курс гривні */
export const revalidate = 21600;

export default function HomePage() {
  return (
    <>
      <Header tone="light" />
      <main>
        <Hero />
        <About />
        <Results />
        <Formats />
        <Problems />
        <Cases />
        <Process />
        <Reviews />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <StickyCta href="/#formaty" label="Обрати формат" title="Від 30 €" sub="Zoom, 30–90 хв" />
    </>
  );
}
