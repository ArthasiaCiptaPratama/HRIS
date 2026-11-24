import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Me } from "@/features/auth/schemas";
import { CompleteDataBanner } from "@/features/time-management/components/home-insights";
import { InstallBanner } from "@/features/time-management/components/install-banner";
import { getInstallPrompt, takeInstallPrompt } from "@/lib/standalone";
import { me } from "./helpers";

// TM-D32: banner pasang (Android/iPhone), penangkapan awal `beforeinstallprompt`, dan tautan web di standalone.

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605 Safari/604";

function stubEnv(ua: string, standalone = false) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({ matches: standalone && q.includes("standalone"), media: q })),
  );
}

function fireInstallPrompt() {
  const prompt = vi.fn(async () => undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { prompt, event };
}

beforeEach(() => {
  takeInstallPrompt();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InstallBanner (TM-D32)", () => {
  it("Android: prompt yang datang SEBELUM banner tampil tetap dipakai → tombol memanggil prompt()", async () => {
    stubEnv(ANDROID);
    const { prompt, event } = fireInstallPrompt();
    expect(event.defaultPrevented).toBe(true);
    expect(getInstallPrompt()).not.toBeNull();
    render(<InstallBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Pasang ke layar utama" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(getInstallPrompt()).toBeNull();
  });

  it("Android tanpa prompt tersimpan: banner tidak tampil; muncul saat event datang", () => {
    stubEnv(ANDROID);
    render(<InstallBanner />);
    expect(screen.queryByText(/Pasang Akselerasi Arthasia/)).not.toBeInTheDocument();
    fireInstallPrompt();
    expect(screen.getByText(/Pasang Akselerasi Arthasia/)).toBeInTheDocument();
  });

  it("iPhone: petunjuk Bagikan → Tambahkan ke Layar Utama (tanpa tombol pasang)", () => {
    stubEnv(IPHONE);
    render(<InstallBanner />);
    expect(screen.getByText("Tambahkan ke Layar Utama")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasang ke layar utama" })).not.toBeInTheDocument();
  });

  it("ditutup → hilang dan tersimpan; render ulang tetap tersembunyi", async () => {
    stubEnv(IPHONE);
    const { unmount } = render(<InstallBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Tutup ajakan pasang" }));
    expect(screen.queryByText(/Pasang Akselerasi Arthasia/)).not.toBeInTheDocument();
    expect(localStorage.getItem("hris.absen-install-dismissed")).toBe("1");
    unmount();
    render(<InstallBanner />);
    expect(screen.queryByText(/Pasang Akselerasi Arthasia/)).not.toBeInTheDocument();
  });

  it("standalone: tersembunyi (iPhone maupun Android dengan prompt)", () => {
    stubEnv(IPHONE, true);
    fireInstallPrompt();
    render(<InstallBanner />);
    expect(screen.queryByText(/Pasang Akselerasi Arthasia/)).not.toBeInTheDocument();
  });

  it("desktop (bukan HP, tanpa prompt): tersembunyi", () => {
    stubEnv("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126");
    render(<InstallBanner />);
    expect(screen.queryByText(/Pasang Akselerasi Arthasia/)).not.toBeInTheDocument();
  });
});

describe("Tautan web dari beranda absen (TM-D32, Q2-A)", () => {
  const incomplete = {
    ...me("EMPLOYEE", false, "emp-1"),
    onboarding: { completionRequired: true, submitted: false, locked: false },
  } as unknown as Me;

  it("standalone: banner Lengkapi data membuka browser HP (tidak berpindah di dalam aplikasi)", async () => {
    stubEnv("Mozilla/5.0 (iPhone)", true);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    render(
      <MemoryRouter>
        <CompleteDataBanner me={incomplete} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("link"));
    expect(open).toHaveBeenCalledWith(`${window.location.origin}/onboarding`, "_blank", "noopener");
  });

  it("browser: tautan berjalan normal (tanpa membuka jendela baru)", async () => {
    stubEnv("Mozilla/5.0 (iPhone)", false);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    render(
      <MemoryRouter>
        <CompleteDataBanner me={incomplete} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("link"));
    expect(open).not.toHaveBeenCalled();
  });
});
