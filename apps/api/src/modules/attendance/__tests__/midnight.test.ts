import { describe, expect, test } from "bun:test";
import {
  breakWindow,
  candidateDates,
  checkOutLabels,
  localDate,
  planCheckIn,
  restShortfall,
  shiftWindow,
} from "../attendance-engine.ts";

// TM-D13: batas tepat 00:00 — shift 3 (00:00–08:00, malam setelah tanggal roster) & shift 2 (16:00–24:00).
// Buka absen 60 menit, toleransi telat/pulang cepat 15 menit, batas Clock Out 4 jam (default pengaturan).
const WIB = "Asia/Jakarta";
const at = (iso: string, tz = "+07:00") => new Date(`${iso}${tz}`);
const base = {
  checkInOpenMin: 60,
  lateToleranceMin: 15,
  earlyLeaveToleranceMin: 15,
  checkOutCloseMin: 240,
};
const s1 = { ...base, startMinute: 8 * 60, endMinute: 16 * 60 };
const s2 = { ...base, startMinute: 16 * 60, endMinute: 0 };
const s3 = { ...base, startMinute: 0, endMinute: 8 * 60, startsNextDay: true };
const roster = (entries: Record<string, unknown>) =>
  Object.entries(entries).map(([workDate, shift]) => ({ workDate, shift: shift as never }));
const iso = (d: Date) => d.toISOString();

describe("tanggal lokal tepat di 00:00", () => {
  test("23:59:59 masih tanggal 27; 00:00:00 sudah tanggal 28", () => {
    expect(localDate(at("2026-10-27T23:59:59"), WIB)).toBe("2026-10-27");
    expect(localDate(at("2026-10-28T00:00:00"), WIB)).toBe("2026-10-28");
  });

  test("tap 00:00 tgl 28 tetap melihat roster kemarin (27) sebagai kandidat", () => {
    expect(candidateDates(at("2026-10-28T00:00:00"), WIB)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
    ]);
  });
});

describe("Clock In shift 3 roster 27 (28 Okt 00:00–08:00)", () => {
  const days = roster({ "2026-10-26": null, "2026-10-27": s3, "2026-10-28": null });
  const plan = (hhmmss: string, date = "2026-10-28") =>
    planCheckIn(at(`${date}T${hhmmss}`), WIB, days);

  test("22:59 tgl 27 → absen belum dibuka (di luar jadwal)", () => {
    expect(plan("22:59:00", "2026-10-27")).toMatchObject({
      workDate: "2026-10-27",
      labels: ["OUTSIDE_ROSTER"],
    });
  });

  test("23:00 tgl 27 (buka absen) → tanggal kerja 27, tidak telat", () => {
    expect(plan("23:00:00", "2026-10-27")).toMatchObject({ workDate: "2026-10-27", labels: [] });
  });

  test("tepat 00:00 tgl 28 → tanggal kerja 27 (bukan 28), tidak telat", () => {
    const p = plan("00:00:00");
    expect(p).toMatchObject({ workDate: "2026-10-27", labels: [], offDay: false });
    expect(iso(p.window?.start as Date)).toBe(iso(at("2026-10-28T00:00:00")));
  });

  test("00:15 masih dalam toleransi; 00:15:01 → Telat", () => {
    expect(plan("00:15:00").labels).toEqual([]);
    expect(plan("00:15:01").labels).toEqual(["LATE"]);
  });

  test("08:00 (jam selesai) masih tercatat shift 27 (telat); 08:00:01 → di luar jadwal", () => {
    expect(plan("08:00:00")).toMatchObject({ workDate: "2026-10-27", labels: ["LATE"] });
    expect(plan("08:00:01")).toMatchObject({ workDate: "2026-10-28", labels: ["OUTSIDE_ROSTER"] });
  });

  test("roster 28 OFF + tap 00:05 tgl 28 → tetap shift 27, bukan hari libur", () => {
    expect(plan("00:05:00")).toMatchObject({ workDate: "2026-10-27", offDay: false });
  });
});

describe("shift 00:00–08:00 TANPA centang 'mulai setelah tengah malam' (perilaku lama)", () => {
  const legacy = { ...s3, startsNextDay: false };

  test("roster 28 → mulai 28 Okt 00:00; tap 23:30 tgl 27 masuk ke tanggal 28", () => {
    expect(iso(shiftWindow("2026-10-28", legacy, WIB).start)).toBe(iso(at("2026-10-28T00:00:00")));
    const p = planCheckIn(
      at("2026-10-27T23:30:00"),
      WIB,
      roster({ "2026-10-27": null, "2026-10-28": legacy }),
    );
    expect(p).toMatchObject({ workDate: "2026-10-28", labels: [] });
  });
});

describe("Clock Out shift 2 roster 27 (16:00–24:00, selesai 28 Okt 00:00)", () => {
  const w = shiftWindow("2026-10-27", s2, WIB);
  const out = (iso: string) => checkOutLabels(at(iso), w, s2.earlyLeaveToleranceMin);

  test("jam selesai = 28 Okt 00:00; batas Clock Out 04:00", () => {
    expect(iso(w.end)).toBe(iso(at("2026-10-28T00:00:00")));
    expect(iso(w.checkOutDeadline)).toBe(iso(at("2026-10-28T04:00:00")));
  });

  test("23:44 → pulang cepat; 23:45 & tepat 00:00 → normal", () => {
    expect(out("2026-10-27T23:44:59")).toEqual(["EARLY_LEAVE"]);
    expect(out("2026-10-27T23:45:00")).toEqual([]);
    expect(out("2026-10-28T00:00:00")).toEqual([]);
  });

  test("04:00 masih boleh; 04:00:01 → di luar jadwal", () => {
    expect(out("2026-10-28T04:00:00")).toEqual([]);
    expect(out("2026-10-28T04:00:01")).toEqual(["OUTSIDE_ROSTER"]);
  });
});

describe("Clock Out shift 3 roster 27 (selesai 28 Okt 08:00)", () => {
  const w = shiftWindow("2026-10-27", s3, WIB);
  const out = (iso: string) => checkOutLabels(at(iso), w, s3.earlyLeaveToleranceMin);

  test("00:30 tgl 28 → pulang cepat; 07:45 → normal; 12:00:01 → di luar jadwal", () => {
    expect(out("2026-10-28T00:30:00")).toEqual(["EARLY_LEAVE"]);
    expect(out("2026-10-28T07:45:00")).toEqual([]);
    expect(out("2026-10-28T12:00:00")).toEqual([]);
    expect(out("2026-10-28T12:00:01")).toEqual(["OUTSIDE_ROSTER"]);
  });
});

describe("pergantian shift di sekitar 00:00", () => {
  test("shift 2 roster 27 sudah Clock In; tap 00:00 tgl 28 tidak dianggap Clock In shift 3", () => {
    const p = planCheckIn(
      at("2026-10-28T00:00:00"),
      WIB,
      roster({ "2026-10-27": s2, "2026-10-28": s2 }),
      new Set(["2026-10-27"]),
    );
    // Shift 2 roster 28 baru buka 15:00 → di luar jadwal, tanggal lokal 28.
    expect(p).toMatchObject({ workDate: "2026-10-28", labels: ["OUTSIDE_ROSTER"] });
  });

  test("shift 3 roster 27 lalu shift 1 roster 28 (08:00): tap 07:50 setelah shift 3 → shift 1 tgl 28", () => {
    const days = roster({ "2026-10-27": s3, "2026-10-28": s1 });
    expect(
      planCheckIn(at("2026-10-28T07:50:00"), WIB, days, new Set(["2026-10-27"])),
    ).toMatchObject({ workDate: "2026-10-28", labels: [] });
  });

  test("jeda: pulang 00:00 (shift 2) lalu masuk 07:59 → kurang 8 jam; 08:00 → cukup", () => {
    const days = [
      { punches: [{ kind: "OUT", at: at("2026-10-28T00:00:00"), status: "APPROVED" }] },
    ];
    expect(restShortfall(days, at("2026-10-28T07:59:00"), 8)).toBe(true);
    expect(restShortfall(days, at("2026-10-28T08:00:00"), 8)).toBe(false);
  });
});

describe("istirahat melewati 00:00", () => {
  test("shift 2 istirahat 23:30–00:30 → tutup 28 Okt 00:30", () => {
    const w = breakWindow(
      "2026-10-27",
      { ...s2, breakStartMinute: 23 * 60 + 30, breakEndMinute: 30 },
      WIB,
    );
    expect(iso(w?.opens as Date)).toBe(iso(at("2026-10-27T23:30:00")));
    expect(iso(w?.closes as Date)).toBe(iso(at("2026-10-28T00:30:00")));
  });

  test("shift 3 istirahat tepat 00:00–00:30 → tanggal 28, bukan 27", () => {
    const w = breakWindow("2026-10-27", { ...s3, breakStartMinute: 0, breakEndMinute: 30 }, WIB);
    expect(iso(w?.opens as Date)).toBe(iso(at("2026-10-28T00:00:00")));
  });
});

describe("00:00 di pergantian bulan / tahun & zona waktu", () => {
  test("shift 3 roster 31 Okt → 1 Nov 00:00; tap 00:05 1 Nov tetap Oktober (periode Oktober)", () => {
    const p = planCheckIn(
      at("2026-11-01T00:05:00"),
      WIB,
      roster({ "2026-10-31": s3, "2026-11-01": null }),
    );
    expect(p.workDate).toBe("2026-10-31");
  });

  test("shift 3 roster 31 Des → 1 Jan 00:00 tahun berikutnya", () => {
    const w = shiftWindow("2026-12-31", s3, WIB);
    expect(iso(w.start)).toBe(iso(at("2027-01-01T00:00:00")));
    expect(planCheckIn(at("2027-01-01T00:00:00"), WIB, roster({ "2026-12-31": s3 })).workDate).toBe(
      "2026-12-31",
    );
  });

  test("WITA / WIT: 00:00 mengikuti zona pengaturan", () => {
    expect(iso(shiftWindow("2026-10-27", s3, "Asia/Makassar").start)).toBe(
      iso(at("2026-10-28T00:00:00", "+08:00")),
    );
    expect(iso(shiftWindow("2026-10-27", s3, "Asia/Jayapura").start)).toBe(
      iso(at("2026-10-28T00:00:00", "+09:00")),
    );
  });

  test("shift 24 jam 00:00–00:00 → panjang 24 jam", () => {
    const w = shiftWindow("2026-10-27", { ...s3, endMinute: 0 }, WIB);
    expect(w.end.getTime() - w.start.getTime()).toBe(24 * 3600_000);
  });
});
