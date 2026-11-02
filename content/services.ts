/**
 * ПРИКЛАД: три послуги нижче - зразок. Заміни назви, ціни, тексти і фото на свої
 * (або попроси ШІ-наставника переписати цей файл під твою нішу).
 *
 * ПОСЛУГИ — єдине джерело цін, тривалості та текстів.
 * Ціни звідси використовує і сайт, і сервер оплати, тож змінювати їх треба лише тут.
 *
 * slug — частина адреси сторінки (/poslugy/<slug>), після запуску краще не змінювати.
 */

export type ServiceSlug = "posluga-1" | "posluga-2" | "posluga-3";

export type Service = {
  slug: ServiceSlug;
  /** Коротка назва для кнопок, таблиць, Telegram */
  name: string;
  /** Дуже коротка назва для чіпів на першому екрані */
  short: string;
  /** Повна назва на сторінці */
  title: string;
  priceEur: number;
  /** Тривалість зустрічі в календарі (хвилини) */
  durationMin: number;
  durationLabel: string;
  formatLabel: string;
  lead: string;
  forWhomTitle: string;
  forWhom: string[];
  includesTitle: string;
  includes: string[];
  result: string;
  note?: string;
  cta: string;
  /** Пояснення, з чим людина приходить — для блоку «як обрати» */
  chooseIf: string;
  /** Чи потрібні додаткові питання в анкеті */
  extendedForm: boolean;
  /** Як підготуватися — потрапляє в лист-підтвердження */
  preparation: string[];
  /** Фото для картки послуги (вертикальне) */
  image: string;
};

export const services: Service[] = [
  {
    slug: "posluga-1",
    short: "Знайомство",
    image: "/images/svc-1.jpg",
    name: "Перша зустріч",
    title: "Перша зустріч",
    priceEur: 30,
    durationMin: 30,
    durationLabel: "30 хвилин",
    formatLabel: "Zoom",
    lead: "Приклад короткої послуги. Заміни цей текст: що людина отримає за 30 хвилин і чому варто почати саме з цього.",
    forWhomTitle: "Для кого",
    forWhom: ["Приклад: хочеш познайомитися і зрозуміти, чим я можу допомогти.", "Приклад: є одне конкретне питання."],
    includesTitle: "Що входить",
    includes: ["Приклад пункту 1", "Приклад пункту 2", "Приклад пункту 3"],
    result: "Приклад: ти розумієш свої наступні кроки.",
    cta: "Записатися — 30 €",
    chooseIf: "Приклад: ти тільки знайомишся зі мною.",
    extendedForm: false,
    preparation: ["Підключись із тихого місця з хорошим інтернетом.", "Запиши заздалегідь свої питання."],
  },
  {
    slug: "posluga-2",
    short: "Консультація",
    image: "/images/svc-2.jpg",
    name: "Консультація",
    title: "Консультація",
    priceEur: 80,
    durationMin: 60,
    durationLabel: "60 хвилин",
    formatLabel: "Zoom",
    lead: "Приклад основної послуги. Заміни цей текст: з якими запитами приходять і що людина отримає після зустрічі.",
    forWhomTitle: "Можливі теми",
    forWhom: ["Тема 1", "Тема 2", "Тема 3", "Тема 4"],
    includesTitle: "Як проходить",
    includes: ["Ти заповнюєш коротку анкету", "Я готуюся до зустрічі", "60 хвилин роботи в Zoom", "Рекомендації і наступні кроки"],
    result: "Приклад: відповіді на твої питання і зрозумілий план.",
    cta: "Записатися — 80 €",
    chooseIf: "Приклад: є конкретні питання і потрібен план дій.",
    extendedForm: false,
    preparation: ["Ще раз переглянь свої питання з анкети.", "Підключись із тихого місця, щоб можна було нотувати."],
  },
  {
    slug: "posluga-3",
    short: "Супровід",
    image: "/images/svc-3.jpg",
    name: "Глибока робота",
    title: "Глибока робота",
    priceEur: 150,
    durationMin: 90,
    durationLabel: "90 хвилин",
    formatLabel: "Zoom",
    lead: "Приклад найбільшої послуги. Заміни цей текст: що входить у глибоку роботу і який результат людина отримає.",
    forWhomTitle: "Для кого",
    forWhom: ["Приклад: хочеш системно розібратися в темі.", "Приклад: потрібен план на кілька місяців."],
    includesTitle: "Що входить",
    includes: ["Приклад пункту 1", "Приклад пункту 2", "Приклад пункту 3", "Приклад пункту 4"],
    result: "Приклад: після зустрічі ти отримуєш свій план.",
    note: "Анкета для цієї послуги містить кілька додаткових запитань.",
    cta: "Записатися — 150 €",
    chooseIf: "Приклад: потрібна глибока робота і план на перспективу.",
    extendedForm: true,
    preparation: ["Заповни анкету детально - я вивчу її до зустрічі.", "Заклади повні півтори години без поспіху."],
  },
];

export function getService(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}

/** Рядки для таблиці порівняння: true/false або текст */
export const comparison: { label: string; values: [string | boolean, string | boolean, string | boolean] }[] = [
  { label: "Тривалість", values: ["30 хв", "60 хв", "90 хв"] },
  { label: "Формат", values: ["Zoom", "Zoom", "Zoom"] },
  { label: "Анкета перед зустріччю", values: [false, true, true] },
  { label: "Твої питання", values: ["1", "до 3", "без обмежень"] },
  { label: "План дій", values: [false, true, true] },
];
