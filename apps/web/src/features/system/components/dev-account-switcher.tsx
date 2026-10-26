import { useEffect, useState } from "react";
import { env } from "@/lib/env";
import { DEV_TAB_AUTH_KEY, devTabAuthKey } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// DEV-ONLY (bagian panel DB dev): sekali klik masuk sebagai akun uji @arthasia.test di tab ini saja.
// Sesi dari /dev/test-session (Supabase Auth lokal) disimpan di sessionStorage tab → tab lain tetap pada
// akunnya masing-masing. "Login biasa" mengembalikan tab ke sesi bersama (localStorage).

type TestAccount = { email: string; role: string; employeeId: string | null };

const ROLE_TEXT: Record<string, string> = {
  SUPER_ADMIN: "SA",
  HR_ADMIN: "HR",
  HR_PERSONNEL: "HR Kepeg.",
  MANAGER: "Atasan",
  EMPLOYEE: "Karyawan",
};

/** Email akun yang sedang dipakai tab ini (mode per tab), atau null. */
export function tabAccountEmail(): string | null {
  if (!devTabAuthKey) return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(devTabAuthKey) ?? "null") as {
      user?: { email?: string };
    } | null;
    return raw?.user?.email ?? null;
  } catch {
    return null;
  }
}

export function DevAccountSwitcher() {
  const [accounts, setAccounts] = useState<TestAccount[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = tabAccountEmail();

  useEffect(() => {
    void fetch(`${env.VITE_API_BASE_URL}/dev/test-accounts`)
      .then(async (res) => (res.ok ? ((await res.json()).data as TestAccount[]) : []))
      .catch(() => [])
      .then(setAccounts);
  }, []);

  if (!accounts || accounts.length === 0) return null;

  async function pickAccount(account: TestAccount) {
    setBusy(account.email);
    setError(null);
    try {
      const res = await fetch(`${env.VITE_API_BASE_URL}/dev/test-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email }),
      });
      const json = (await res.json()) as { data?: unknown; error?: { message: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Gagal masuk.");
      const key = devTabAuthKey ?? `sb-dev-tab-${crypto.randomUUID().slice(0, 8)}`;
      sessionStorage.setItem(key, JSON.stringify(json.data));
      sessionStorage.setItem(DEV_TAB_AUTH_KEY, key);
      window.location.assign(account.role === "EMPLOYEE" ? "/absen" : "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal masuk.");
      setBusy(null);
    }
  }

  function backToSharedLogin() {
    try {
      if (devTabAuthKey) sessionStorage.removeItem(devTabAuthKey);
      sessionStorage.removeItem(DEV_TAB_AUTH_KEY);
    } catch {
      // abaikan
    }
    window.location.assign("/");
  }

  return (
    <div className="mt-3 border-t border-amber-300/70 pt-2">
      <p className="mb-1 font-semibold text-amber-900 dark:text-amber-200">Akun uji (tab ini)</p>
      <ul className="max-h-52 space-y-1 overflow-y-auto pr-0.5">
        {accounts.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void pickAccount(a)}
              aria-pressed={current === a.email}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left transition-colors disabled:opacity-50",
                current === a.email
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:bg-transparent dark:text-amber-200",
              )}
            >
              <span className="min-w-0 truncate font-mono text-[10px]">
                {a.email.replace(/@arthasia\.test$/, "")}
              </span>
              <span className="shrink-0 text-[10px] opacity-80">
                {busy === a.email ? "…" : (ROLE_TEXT[a.role] ?? a.role)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {current ? (
        <button
          type="button"
          onClick={backToSharedLogin}
          className="mt-1.5 w-full text-left text-[11px] text-amber-700 underline dark:text-amber-300"
        >
          Kembali ke login biasa
        </button>
      ) : (
        <p className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-300">
          Buka tab baru lalu pilih akun lain untuk menguji beberapa akun sekaligus.
        </p>
      )}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
