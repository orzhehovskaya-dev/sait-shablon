import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вхід", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="login admin">
      <LoginForm />
    </main>
  );
}
