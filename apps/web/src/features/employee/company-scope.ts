import { useSyncExternalStore } from "react";

// D-040: perusahaan yang sedang dipilih di top bar (per browser). `null` = semua perusahaan dalam
// cakupan. Hanya kenyamanan tampilan — API tetap membatasi cakupan per akun (sumber kebenaran).
const STORAGE_KEY = "hris.companyId";

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let selected: string | null = read();
const listeners = new Set<() => void>();

export function setSelectedCompany(id: string | null): void {
  selected = id;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Penyimpanan diblokir (mode privat): pilihan tetap berlaku sampai halaman dimuat ulang.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Id tersimpan mentah; divalidasi terhadap daftar perusahaan oleh `useCompanyScope` (api.ts). */
export function useStoredCompanyId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => selected,
    () => null,
  );
}
