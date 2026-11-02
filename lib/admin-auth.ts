import "server-only";
import { redirect } from "next/navigation";
import { authClient } from "./supabase/server.ts";
import { db } from "./supabase/admin.ts";

export type AdminRole = "owner" | "assistant";
export type Admin = { id: string; email: string; role: AdminRole };

/** Повертає адміністратора або null. Роль перевіряється в таблиці admin_users на сервері. */
export async function getAdmin(): Promise<Admin | null> {
  const supa = await authClient();
  const { data } = await supa.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await db().from("admin_users").select("role").eq("user_id", data.user.id).maybeSingle();
  if (!row) return null;
  return { id: data.user.id, email: data.user.email ?? "", role: row.role as AdminRole };
}

export async function requireAdmin(role?: AdminRole): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (role === "owner" && admin.role !== "owner") redirect("/admin?error=forbidden");
  return admin;
}
