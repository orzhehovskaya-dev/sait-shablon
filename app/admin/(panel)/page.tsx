import Link from "next/link";
import { services } from "@/content/services";
import { listBookings, parseFilters, filtersToQuery, stats, revenueEur, STATUS_LABEL } from "@/lib/admin-data";
import { formatDateNumeric, timeKey } from "@/lib/time";

const eur = (n: number) => `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n)} €`;

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const rows = await listBookings(f);
  const s = stats(rows);
  const qs = filtersToQuery(f);

  return (
    <>
      <h1>Бронювання</h1>
      {sp.error === "forbidden" && <div className="flash flash--error">Ця дія доступна лише власниці.</div>}

      <div className="kpis">
        <div className="kpi">
          <span>Виручка</span>
          <b>{eur(s.revenue)}</b>
        </div>
        {Object.values(s.byService).map((x) => (
          <div className="kpi" key={x.name}>
            <span>
              {x.name} ({x.count})
            </span>
            <b>{eur(x.revenue)}</b>
          </div>
        ))}
        <div className="kpi">
          <span>
            Заявки → оплати ({s.applications} → {s.paid})
          </span>
          <b>{s.conversion}%</b>
        </div>
      </div>

      <form className="filters" method="get">
        <label>
          Пошук
          <input name="q" defaultValue={f.q} placeholder="Ім'я, email, Instagram, номер" />
        </label>
        <label>
          Зустріч від
          <input type="date" name="from" defaultValue={f.from} />
        </label>
        <label>
          до
          <input type="date" name="to" defaultValue={f.to} />
        </label>
        <label>
          Послуга
          <select name="service" defaultValue={f.service}>
            <option value="">Усі</option>
            {services.map((x) => (
              <option key={x.slug} value={x.slug}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Статус
          <select name="status" defaultValue={f.status}>
            <option value="">Усі заявки</option>
            <option value="paid">Оплачені</option>
            <option value="unpaid">Неоплачені</option>
            <option value="refunded">Повернені</option>
            <option value="cancelled">Скасовані</option>
            <option value="conflict">Конфлікт часу</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Показати
        </button>
        <a className="btn btn--ghost" href={`/api/admin/export?${qs}`}>
          CSV
        </a>
      </form>

      <p className="small muted">
        Показано: {rows.length}
        {rows.length >= 500 ? " (перші 500 — звузь фільтр)" : ""}. Оплачених майбутніх зустрічей: {s.upcoming}.
      </p>

      <div className="table-wrap">
        <table className="atable">
          <thead>
            <tr>
              <th>Зустріч</th>
              <th>Клієнт</th>
              <th>Послуга</th>
              <th>Статус</th>
              <th>Сума</th>
              <th>Instagram</th>
              <th>Запит</th>
              <th>Створено</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const start = new Date(b.starts_at);
              return (
                <tr key={b.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatDateNumeric(start)}
                    <br />
                    <span className="muted">{timeKey(start)}</span>
                  </td>
                  <td>
                    <Link href={`/admin/bookings/${b.id}`}>{b.full_name}</Link>
                    <br />
                    <span className="muted small">{b.email}</span>
                  </td>
                  <td>
                    <Link href={`/admin/bookings/${b.id}`}>{b.service_name}</Link>
                    <br />
                    <Link href={`/admin/bookings/${b.id}`} className="small">Відкрити →</Link>
                  </td>
                  <td>
                    <span className={`badge badge--${b.status}`}>{STATUS_LABEL[b.status]}</span>
                    {b.fulfilment_error && b.status === "paid" && <div className="small" style={{ color: "var(--danger)" }}>потребує уваги</div>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{revenueEur(b) ? eur(revenueEur(b)) : <span className="muted">{eur(Number(b.price_eur))}</span>}</td>
                  <td>
                    <a href={b.instagram} target="_blank" rel="noopener noreferrer">
                      {b.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, "")}
                    </a>
                  </td>
                  <td style={{ maxWidth: 280 }} className="small">
                    {!b.main_request ? <span className="muted">анкета ще не заповнена</span> : b.main_request.length > 120 ? b.main_request.slice(0, 120) + "…" : b.main_request}
                  </td>
                  <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                    {formatDateNumeric(new Date(b.created_at))}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="muted">
                  За цими фільтрами нічого немає.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
