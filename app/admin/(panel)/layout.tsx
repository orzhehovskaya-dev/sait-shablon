import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { site } from "@/content/site";
import { signOutAction } from "../actions";

export const metadata: Metadata = { title: "Адмінка", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="admin">
      <header className="admin__bar">
        <span className="admin__brand">{site.brand}</span>
        <nav aria-label="Адмінка">
          <Link href="/admin">Бронювання</Link>
          {admin.role === "owner" && <Link href="/admin/settings">Розклад</Link>}
          {admin.role === "owner" && <Link href="/admin/status">Підключення</Link>}
          <Link href="/" target="_blank">
            Сайт
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-btn" style={{ padding: 0 }}>
              Вийти
            </button>
          </form>
        </nav>
      </header>
      <main className="admin__main">{children}</main>
    </div>
  );
}
