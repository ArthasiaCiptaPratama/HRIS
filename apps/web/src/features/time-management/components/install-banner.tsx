import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getInstallPrompt,
  isStandalone,
  subscribeInstallPrompt,
  takeInstallPrompt,
} from "@/lib/standalone";

// TM-D32: ajakan memasang Absen ke layar utama. Hanya di browser HP (bukan standalone, bukan desktop).
// Android: tombol dari `beforeinstallprompt` (ditangkap lebih awal di `lib/standalone.ts`); iPhone/iPad: petunjuk Bagikan → Tambahkan ke Layar Utama.

const DISMISS_KEY = "hris.absen-install-dismissed";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [, rerender] = useState(0);
  useEffect(() => {
    return subscribeInstallPrompt(() => rerender((n) => n + 1));
  }, []);

  if (dismissed || isStandalone()) return null;
  const ios = isIos();
  if (!ios && !getInstallPrompt()) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // diabaikan: banner hanya tersembunyi selama halaman ini terbuka
    }
  };
  const install = async () => {
    const prompt = takeInstallPrompt();
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    rerender((n) => n + 1);
  };

  return (
    <section
      aria-label="Pasang aplikasi"
      className="bg-card flex items-start gap-3 rounded-2xl border p-3 text-sm"
    >
      <span className="bg-brand-soft text-brand-soft-foreground grid size-9 shrink-0 place-items-center rounded-xl">
        <Download className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium">Pasang Akselerasi Arthasia ke layar utama</p>
        {ios ? (
          <p className="text-muted-foreground text-xs">
            Ketuk <Share className="inline size-3.5 align-text-bottom" aria-hidden /> Bagikan di
            Safari, lalu pilih <span className="font-medium">Tambahkan ke Layar Utama</span>.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Buka Absen langsung dari ikon, tanpa unduh dari toko aplikasi.
            </p>
            <Button size="sm" onClick={() => void install()}>
              Pasang ke layar utama
            </Button>
          </>
        )}
      </div>
      <Button size="icon-sm" variant="ghost" aria-label="Tutup ajakan pasang" onClick={dismiss}>
        <X />
      </Button>
    </section>
  );
}
