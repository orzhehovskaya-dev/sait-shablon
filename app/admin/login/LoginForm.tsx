"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const m = error.message || "";
      setError(
        /confirm/i.test(m)
          ? "Пошту ще не підтверджено. Підтверди її в Supabase (Authentication → Users)."
          : /invalid/i.test(m)
            ? "Невірний email або пароль"
            : `Не вдалося увійти: ${m}`,
      );
      setBusy(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/admin") ? next : "/admin";
  };

  return (
    <form onSubmit={submit}>
      <h1>Вхід в адмінку</h1>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <div className="flash flash--error">{error}</div>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Входимо…" : "Увійти"}
      </button>
    </form>
  );
}
