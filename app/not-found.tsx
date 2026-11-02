import Link from "next/link";
import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="wrap result">
        <h1 className="result__title">Такої сторінки немає</h1>
        <p className="lead">Можливо, посилання застаріло. Усі формати роботи — на головній.</p>
        <div className="result__actions">
          <Link href="/" className="btn">
            На головну
          </Link>
        </div>
      </main>
    </>
  );
}
