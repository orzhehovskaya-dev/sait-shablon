import { requireAdmin } from "@/lib/admin-auth";
import { CHECKS, getChecks, getEndToEnd } from "@/lib/diagnostics";
import { formatDateNumeric, timeKey } from "@/lib/time";
import { runCheckAction } from "../../actions";

const when = (iso: string) => `${formatDateNumeric(new Date(iso))} ${timeKey(new Date(iso))}`;

export default async function StatusPage() {
  await requireAdmin("owner");
  let checks: Awaited<ReturnType<typeof getChecks>> = {};
  let e2e: Awaited<ReturnType<typeof getEndToEnd>> = [];
  let dbError: string | null = null;
  try {
    [checks, e2e] = await Promise.all([getChecks(), getEndToEnd()]);
  } catch (e) {
    dbError = (e as Error).message;
  }
  const isSet = (k: string) => Boolean(process.env[k] && process.env[k]!.trim());

  return (
    <>
      <h1>Підключення</h1>
      <p className="muted" style={{ maxWidth: "44em" }}>
        Сервіс вважається робочим лише після успішної перевірки. Значення ключів тут ніколи не показуються — лише чи задані вони.
      </p>
      {dbError && <div className="flash flash--error">База недоступна: {dbError}</div>}

      <div className="table-wrap" style={{ marginBottom: 32 }}>
        <table className="atable" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Сервіс</th>
              <th>Статус</th>
              <th>Деталі</th>
              <th>Змінні</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {CHECKS.map((c) => {
              const r = checks[c.name];
              return (
                <tr key={c.name} id={c.name}>
                  <td>
                    <b>{c.title}</b>
                    <div className="small muted">{c.what}</div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {!r ? (
                      <span className="badge badge--expired">Не перевірено</span>
                    ) : r.ok ? (
                      <span className="badge badge--paid">Працює</span>
                    ) : (
                      <span className="badge badge--conflict">Помилка</span>
                    )}
                    {r && <div className="small muted">{when(r.checked_at)}</div>}
                  </td>
                  <td className="small" style={{ maxWidth: 420 }}>
                    {r?.detail ?? "—"}
                  </td>
                  <td className="small">
                    {c.env.map((k) => (
                      <div key={k} style={{ whiteSpace: "nowrap" }}>
                        {isSet(k) ? "✓" : "○"} {k}
                      </div>
                    ))}
                  </td>
                  <td>
                    {c.name !== "cron" && (
                      <form action={runCheckAction}>
                        <input type="hidden" name="name" value={c.name} />
                        <button className="btn btn--ghost" type="submit">
                          Перевірити
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Наскрізний тест бронювання</h2>
      <p className="muted" style={{ maxWidth: "44em" }}>
        Ці пункти стають зеленими лише після справжнього бронювання: забронюй аудит за 50 € своєю карткою, дочекайся листа, а потім зроби повернення в картці бронювання.
      </p>
      <div className="table-wrap">
        <table className="atable" style={{ minWidth: 520 }}>
          <tbody>
            {e2e.map((x) => (
              <tr key={x.title}>
                <td>{x.title}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {x.at ? <span className="badge badge--paid">Підтверджено {when(x.at)}</span> : <span className="badge badge--expired">Ще не було</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
