import { requireAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/booking-service";
import { db } from "@/lib/supabase/admin";
import { dateKey } from "@/lib/time";
import { saveSettingsAction, addBlockedAction, removeBlockedAction } from "../../actions";

const DAYS = ["", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота", "Неділя"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const s = await getSettings();
  const { data: blocked } = await db().from("blocked_dates").select("date, note").gte("date", dateKey(new Date())).order("date");

  return (
    <>
      <h1>Розклад</h1>
      {sp.ok && <div className="flash">{sp.ok}</div>}
      {sp.error && <div className="flash flash--error">{sp.error}</div>}

      <div className="detail">
        <form action={saveSettingsAction} className="panel">
          <h2 style={{ margin: 0 }}>Робочі дні та години</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Київський час. Зайнятий час з Apple Calendar на iPhone враховується автоматично.
          </p>
          <div className="hours">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const w = s.weeklyHours[String(d)]?.[0];
              return (
                <div className="hours__row" key={d}>
                  <label className="check" style={{ gridTemplateColumns: "24px 1fr" }}>
                    <input type="checkbox" name={`on${d}`} defaultChecked={Boolean(w)} />
                    <span>{DAYS[d]}</span>
                  </label>
                  <span />
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="time" name={`start${d}`} className="admin-input" defaultValue={w?.start ?? "10:00"} step={900} />
                    —
                    <input type="time" name={`end${d}`} className="admin-input" defaultValue={w?.end ?? "19:00"} step={900} />
                  </span>
                </div>
              );
            })}
          </div>
          <label className="small">
            Перерва між зустрічами, хв
            <input type="number" name="bufferMin" className="admin-input" min={0} max={240} defaultValue={s.bufferMin} />
          </label>
          <label className="small">
            Крок початку слотів, хв
            <input type="number" name="stepMin" className="admin-input" min={15} max={120} step={15} defaultValue={s.stepMin} />
          </label>
          <label className="small">
            Мінімум годин до зустрічі
            <input type="number" name="minNoticeHours" className="admin-input" min={0} max={336} defaultValue={Math.round(s.minNoticeMin / 60)} />
          </label>
          <label className="small">
            На скільки днів уперед відкрите бронювання
            <input type="number" name="horizonDays" className="admin-input" min={1} max={180} defaultValue={s.horizonDays} />
          </label>
          <button className="btn" type="submit">
            Зберегти розклад
          </button>
        </form>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <form action={addBlockedAction} className="panel">
            <h2 style={{ margin: 0 }}>Заблокувати дні</h2>
            <label className="small">
              З
              <input type="date" name="from" className="admin-input" required />
            </label>
            <label className="small">
              По (необов'язково)
              <input type="date" name="to" className="admin-input" />
            </label>
            <label className="small">
              Нотатка (бачиш лише ти)
              <input name="note" className="admin-input" placeholder="Відпустка" />
            </label>
            <button className="btn btn--ghost" type="submit">
              Заблокувати
            </button>
          </form>

          <div className="panel">
            <h2 style={{ margin: 0 }}>Заблоковані дні</h2>
            {!blocked?.length && <p className="small muted">Немає</p>}
            {blocked?.map((b: { date: string; note: string | null }) => (
              <form key={b.date} action={removeBlockedAction} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <input type="hidden" name="date" value={b.date} />
                <span>
                  {b.date.split("-").reverse().join(".")} <span className="muted small">{b.note}</span>
                </span>
                <button type="submit" className="text-btn">
                  Розблокувати
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
