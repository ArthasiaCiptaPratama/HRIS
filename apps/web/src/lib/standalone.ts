import { useState } from "react";

// TM-D32: Absen dipasang ke layar utama sebagai aplikasi mandiri. Mode "hanya Absen" berlaku HANYA bila
// halaman dibuka dari ikon layar utama (display-mode: standalone). Di browser HP/desktop web tetap utuh.

/** Dibuka dari ikon layar utama? (Android/desktop: display-mode; iOS: navigator.standalone). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (typeof window.matchMedia === "function") {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
    }
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Nilai mode tetap selama halaman terbuka (ikon layar utama tidak berpindah mode di tengah sesi). */
export function useStandalone(): boolean {
  const [standalone] = useState(isStandalone);
  return standalone;
}

/** Path milik aplikasi Absen (`/absen` dan turunannya). */
export function isAbsenPath(pathname: string): boolean {
  return pathname === "/absen" || pathname.startsWith("/absen/");
}

/**
 * Buka halaman web di browser HP dari aplikasi layar utama. Tidak ada API web yang pasti membuka browser
 * sistem: Android → intent Chrome; iOS → window.open (bisa terbuka di dalam aplikasi).
 */
export function openInBrowser(path = "/"): void {
  const absolute = new URL(path, window.location.origin);
  if (/android/i.test(navigator.userAgent)) {
    const scheme = absolute.protocol.replace(":", "");
    window.location.href = `intent://${absolute.host}${absolute.pathname}${absolute.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
    return;
  }
  window.open(absolute.href, "_blank", "noopener");
}

/** Handler klik untuk tautan ke halaman web: di aplikasi layar utama dibuka di browser HP. */
export function webLinkClick(path: string) {
  return (event: { preventDefault: () => void }) => {
    if (!isStandalone()) return;
    event.preventDefault();
    openInBrowser(path);
  };
}

// ── Prompt pasang (Android/Chrome) ───────────────────────────────────────────────────────────────
// `beforeinstallprompt` bisa terjadi sebelum halaman /absen dimuat, jadi ditangkap di modul yang dimuat
// sejak awal (diimpor `guards.tsx`) dan disimpan di tingkat modul; banner hanya membacanya.

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let installPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => {
  for (const notify of installListeners) notify();
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    notifyInstall();
  });
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return installPrompt;
}

/** Ambil & kosongkan prompt tersimpan (prompt hanya boleh dipakai sekali). */
export function takeInstallPrompt(): InstallPromptEvent | null {
  const prompt = installPrompt;
  installPrompt = null;
  return prompt;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}
