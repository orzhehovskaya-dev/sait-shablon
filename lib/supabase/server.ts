import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "../env.ts";

/** Клієнт із сесією користувача (cookies) — для входу в адмінку */
export async function authClient() {
  const store = await cookies();
  const { url, anonKey } = env.supabase();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // виклик із серверного компонента — cookies оновить middleware
        }
      },
    },
  });
}
