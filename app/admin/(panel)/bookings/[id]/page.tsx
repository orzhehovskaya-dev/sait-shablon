import Link from "next/link";
import { notFound } from "next/navigation";
import { getById } from "@/lib/booking-service";
import { requireAdmin } from "@/lib/admin-auth";
import { STATUS_LABEL, revenueEur } from "@/lib/admin-data";
import { formatDateUk, formatDateNumeric, timeKey } from "@/lib/time";
import { refundAction, cancelAction, resendAction, retryFulfilmentAction, noteAction } from "../../../actions";

function Ext({ href }: { href?: string | null }) {
  if (!href) return <span className="muted">—</span>;
  const isUrl = /^https?:\/\//.test(href);
  return isUrl ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {href.replace(/^https?:\/\/(www\.)?/, "")}
    </a>
  ) : (
    <>{href}</>
  );
}

const when = (iso: string | null) => (iso ? `${formatDateNumeric(new Date(iso))} ${timeKey(new Date(iso))}` : "—");

export default async function BookingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const b = await getById(id);
  if (!b) notFound();
  const start = new Date(b.starts_at);
  const canRefund = admin.role === "owner" && ["paid", "conflict", "cancelled"].includes(b.status) && Number(b.refunded_amount) < Number(b.charge_amount);
  const canCancel = admin.role === "owner" && ["paid", "pending_payment", "conflict"].includes(b.status);
  const tg = b.contact.startsWith("@") ? `https://t.me/${b.contact.slice(1)}` : null;

  return (
    <>
      <p>
        <Link href="/admin" className="small">
          ← Усі бронювання
        </Link>
      </p>
      <h1>{b.full_name}</h1>
      <p style={{ marginTop: -12 }}>
        <span className={`badge badge--${b.status}`}>{STATUS_LABEL[b.status]}</span>{" "}
        <span className="muted">
          {b.service_name}, {formatDateUk(start)}, {timeKey(start)}
        </span>
      </p>

      {sp.ok && <div className="flash">{sp.ok}</div>}
      {sp.error && <div className="flash flash--error">{sp.error}</div>}
      {b.fulfilment_error && <div className="flash flash--error">Потребує уваги: {b.fulfilment_error}</div>}

      <div className="detail">
        <div>
          <h2>Контакти та соцмережі</h2>
          <dl className="kv">
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${b.email}`}>{b.email}</a>
            </dd>
            <dt>Контакт</dt>
            <dd>{tg ? <a href={tg} target="_blank" rel="noopener noreferrer">{b.contact}</a> : b.contact}</dd>
            <dt>Instagram</dt>
            <dd>
              <Ext href={b.instagram} />
            </dd>
            <dt>TikTok</dt>
            <dd>
              <Ext href={b.socials?.tiktok} />
            </dd>
            <dt>YouTube</dt>
            <dd>
              <Ext href={b.socials?.youtube} />
            </dd>
            <dt>Сайт</dt>
            <dd>
              <Ext href={b.socials?.website} />
            </dd>
            {(b.socials?.other ?? []).map((o, i) => (
              <div key={i} style={{ display: "contents" }}>
                <dt>{o.label || "Інше"}</dt>
                <dd>
                  <Ext href={o.url} />
                </dd>
              </div>
            ))}
          </dl>

          <h2>Анкета</h2>
          {!b.questionnaire_at && (
            <p className="flash flash--error">Клієнт ще не заповнив анкету. Посилання на неї є в листі-підтвердженні та нагадуванні.</p>
          )}
          <dl className="kv">
            <dt>Чим займається</dt>
            <dd>{b.occupation ?? "—"}</dd>
            <dt>Головний запит</dt>
            <dd>{b.main_request ?? "—"}</dd>
            <dt>Бажаний результат</dt>
            <dd>{b.desired_result ?? "—"}</dd>
            <dt>Запитання на зустріч</dt>
            <dd>{b.questions ?? "—"}</dd>
            {b.strategy && (
              <>
                <dt>Продукти / послуги</dt>
                <dd>{b.strategy.products}</dd>
                <dt>Середній чек</dt>
                <dd>{b.strategy.averageCheck}</dd>
                <dt>Проблеми із залученням</dt>
                <dd>{b.strategy.acquisitionProblems}</dd>
                <dt>Ціль на 3 місяці</dt>
                <dd>{b.strategy.goal3m}</dd>
              </>
            )}
          </dl>

          <h2>Оплата та історія</h2>
          <dl className="kv">
            <dt>Номер замовлення</dt>
            <dd>{b.order_reference}</dd>
            <dt>Ціна</dt>
            <dd>
              {Number(b.price_eur)} € {b.charge_currency !== "EUR" && `(списано ${b.charge_amount} ${b.charge_currency})`}
            </dd>
            <dt>Виручка</dt>
            <dd>{revenueEur(b)} €</dd>
            <dt>Статус WayForPay</dt>
            <dd>{b.payment_status ?? "—"}</dd>
            <dt>Спосіб оплати</dt>
            <dd>{[b.payment_system, b.card_pan].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Створено</dt>
            <dd>{when(b.created_at)}</dd>
            <dt>Оплачено</dt>
            <dd>{when(b.paid_at)}</dd>
            {Number(b.refunded_amount) > 0 && (
              <>
                <dt>Повернено</dt>
                <dd>
                  {b.refunded_amount} {b.charge_currency}, {when(b.refunded_at)}
                </dd>
              </>
            )}
            {b.cancelled_at && (
              <>
                <dt>Скасовано</dt>
                <dd>{when(b.cancelled_at)}</dd>
              </>
            )}
            <dt>Zoom</dt>
            <dd>
              <Ext href={b.zoom_join_url} />
            </dd>
            <dt>Подія в календарі</dt>
            <dd>{b.calendar_event_url ? "створено" : "—"}</dd>
            <dt>Лист клієнту</dt>
            <dd>{when(b.confirmation_sent_at)}</dd>
            <dt>Нагадування</dt>
            <dd>{when(b.reminder_sent_at)}</dd>
            <dt>Telegram</dt>
            <dd>{when(b.owner_notified_at)}</dd>
            <dt>Згода на обробку даних</dt>
            <dd>{when(b.consent_at)}</dd>
            {b.utm && (
              <>
                <dt>Джерело (UTM)</dt>
                <dd>{Object.entries(b.utm).map(([k, v]) => `${k}=${v}`).join("\n")}</dd>
              </>
            )}
          </dl>
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="panel">
            <h2 style={{ margin: 0 }}>Нотатка</h2>
            <form action={noteAction}>
              <input type="hidden" name="id" value={b.id} />
              <textarea name="note" className="admin-input" rows={4} defaultValue={b.admin_note ?? ""} />
              <button className="btn btn--ghost" type="submit">
                Зберегти
              </button>
            </form>
          </div>

          {b.status === "paid" && (
            <div className="panel">
              <h2 style={{ margin: 0 }}>Листи та інтеграції</h2>
              <form action={resendAction}>
                <input type="hidden" name="id" value={b.id} />
                <button className="btn btn--ghost" type="submit">
                  Надіслати підтвердження ще раз
                </button>
              </form>
              {(!b.zoom_join_url || !b.calendar_event_url || !b.owner_notified_at) && (
                <form action={retryFulfilmentAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn btn--ghost" type="submit">
                    Повторити створення Zoom / події
                  </button>
                </form>
              )}
            </div>
          )}

          {canRefund && (
            <div className="panel">
              <h2 style={{ margin: 0 }}>Повернення коштів</h2>
              <form action={refundAction}>
                <input type="hidden" name="id" value={b.id} />
                <label className="small">
                  Сума ({b.charge_currency}), порожньо — повна
                  <input name="amount" className="admin-input" inputMode="decimal" placeholder={String(Number(b.charge_amount) - Number(b.refunded_amount))} />
                </label>
                <label className="small">
                  Коментар для WayForPay
                  <input name="comment" className="admin-input" defaultValue="Повернення за бронюванням" />
                </label>
                <label className="check">
                  <input type="checkbox" name="notify" defaultChecked /> <span>Повідомити клієнта листом</span>
                </label>
                <label className="check">
                  <input type="checkbox" name="confirm" /> <span>Підтверджую повернення</span>
                </label>
                <button className="btn" type="submit">
                  Повернути кошти
                </button>
              </form>
            </div>
          )}

          {canCancel && (
            <div className="panel">
              <h2 style={{ margin: 0 }}>Скасування без повернення</h2>
              <p className="small muted" style={{ margin: 0 }}>
                Звільняє час, видаляє подію в календарі та зустріч у Zoom.
              </p>
              <form action={cancelAction}>
                <input type="hidden" name="id" value={b.id} />
                <label className="check">
                  <input type="checkbox" name="notify" defaultChecked /> <span>Повідомити клієнта листом</span>
                </label>
                <label className="check">
                  <input type="checkbox" name="confirm" /> <span>Підтверджую скасування</span>
                </label>
                <button className="btn btn--ghost" type="submit">
                  Скасувати бронювання
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
