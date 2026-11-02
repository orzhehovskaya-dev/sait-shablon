import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.ts";

let client: SupabaseClient | null = null;

/**
 * Клієнт із service role — обходить RLS, тому використовується ЛИШЕ на сервері
 * і лише після перевірок (публічні API) або перевірки ролі адміністратора.
 */
export function db(): SupabaseClient {
  if (!client) {
    const { url, serviceKey } = env.supabase();
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
