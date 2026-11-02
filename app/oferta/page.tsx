import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { site } from "@/content/site";
import { services } from "@/content/services";

export const metadata: Metadata = { title: "Публічна оферта" };

export default function OfferPage() {
  return (
    <>
      <Header />
      <main className="wrap prose">
        <h1>Публічна оферта</h1>

        <h2>1. Сторони</h2>
        <p>
          Виконавець — {[site.legal.entity, site.legal.address, site.legal.email, site.legal.phone].filter(Boolean).join(", ")}. Замовник — будь-яка особа, яка
          оплатила послугу на цьому сайті.
        </p>

        <h2>2. Послуги та ціни</h2>
        <ul>
          {services.map((s) => (
            <li key={s.slug}>
              {s.name} — {s.priceEur} €, {s.durationLabel}, {s.formatLabel}.
            </li>
          ))}
        </ul>
        <p>Послуги надаються онлайн у Zoom. Оплата — 100% під час бронювання.</p>

        <h2>3. Порядок надання</h2>
        <p>
          Замовник обирає послугу, дату й час, заповнює анкету та оплачує. Бронювання вважається підтвердженим після успішної оплати, про
          що Замовник отримує лист на email.
        </p>

        <h2>4. Перенесення та скасування</h2>
        <p>{site.policies.reschedule}</p>
        <p>{site.policies.cancel}</p>
        <p>{site.policies.noShow}</p>

        <h2>5. Повернення коштів</h2>
        <p>Повернення здійснюється на картку, з якої була оплата, протягом 7 робочих днів з моменту погодження (точний строк зарахування залежить від банку, що випустив картку).</p>

        <h2>6. Інше</h2>
        <p>Консультації не гарантують конкретного фінансового результату — він залежить від дій Замовника.</p>
      </main>
      <Footer />
    </>
  );
}
