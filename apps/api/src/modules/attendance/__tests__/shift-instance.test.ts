import { describe, expect, test } from "bun:test";
import { breakWindow, planCheckIn, restShortfall, shiftWindow } from "../attendance-engine.ts";

// TM-D13: absen per shift (bukan per tanggal kalender). Tanggal kerja = tanggal roster.
const WIB = "Asia/Jakarta";
const at = (iso: string) => new Date(`${iso}+07:00`);
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

describe("shiftWindow: shift 3 = malam setelah tanggal roster", () => {
  test("roster 27 shift 3 → 28 Okt 00:00–08:00; batas Clock Out 12:00", () => {
    const w = shiftWindow("2026-10-27", s3, WIB);
    expect(w.start.toISOString()).toBe(at("2026-10-28T00:00:00").toISOString());
    expect(w.end.toISOString()).toBe(at("2026-10-28T08:00:00").toISOString());
    expect(w.checkInOpen.toISOString()).toBe(at("2026-10-27T23:00:00").toISOString());
    expect(w.checkOutDeadline.toISOString()).toBe(at("2026-10-28T12:00:00").toISOString());
  });

  test("shift 2 16:00–24:00 selesai 00:00 keesokan hari; shift biasa tidak berubah", () => {
    expect(shiftWindow("2026-10-28", s2, WIB).end.toISOString()).toBe(
      at("2026-10-29T00:00:00").toISOString(),
    );
    expect(shiftWindow("2026-10-28", s1, WIB).start.toISOString()).toBe(
      at("2026-10-28T08:00:00").toISOString(),
    );
  });

  test("jendela istirahat shift 3 ikut bergeser (03:00–04:00 tanggal 28)", () => {
    const w = breakWindow("2026-10-27", { ...s3, breakStartMinute: 180, breakEndMinute: 240 }, WIB);
    expect(w?.opens.toISOString()).toBe(at("2026-10-28T03:00:00").toISOString());
  });
});

describe("planCheckIn: dicocokkan ke shift, bukan tanggal kalender", () => {
  const days = roster({ "2026-10-26": null, "2026-10-27": s3, "2026-10-28": s2 });

  test("kasus pemilik projek: shift 3 roster 27 lalu shift 2 roster 28 — keduanya tercatat, 27 tidak hilang", () => {
    const night = planCheckIn(at("2026-10-27T23:50:00"), WIB, days);
    expect(night).toMatchObject({ workDate: "2026-10-27", labels: [], offDay: false });
    const late = planCheckIn(at("2026-10-28T00:20:00"), WIB, days);
    expect(late).toMatchObject({ workDate: "2026-10-27", labels: ["LATE"] });
    const afternoon = planCheckIn(
      at("2026-10-28T15:45:00"),
      WIB,
      roster({ "2026-10-27": s3, "2026-10-28": s2, "2026-10-29": null }),
      new Set(["2026-10-27"]),
    );
    expect(afternoon).toMatchObject({ workDate: "2026-10-28", labels: [] });
  });

  test("shift 3 dua malam berturut-turut: tiap malam masuk ke tanggal rosternya", () => {
    const two = roster({ "2026-10-26": s3, "2026-10-27": s3, "2026-10-28": null });
    expect(planCheckIn(at("2026-10-26T23:50:00"), WIB, two).workDate).toBe("2026-10-26");
    expect(planCheckIn(at("2026-10-27T23:50:00"), WIB, two, new Set(["2026-10-26"])).workDate).toBe(
      "2026-10-27",
    );
  });

  test("shift yang sudah di-Clock In dilewati; tidak ada shift lain terbuka → di luar roster", () => {
    const plan = planCheckIn(at("2026-10-28T01:00:00"), WIB, days, new Set(["2026-10-27"]));
    expect(plan.labels).toEqual(["OUTSIDE_ROSTER"]);
  });

  test("dua jendela terbuka sekaligus → jam mulai terdekat", () => {
    const wide = { ...s2, checkOutCloseMin: 240, checkInOpenMin: 600 };
    const plan = planCheckIn(
      at("2026-10-28T15:50:00"),
      WIB,
      roster({ "2026-10-27": { ...s3, checkInOpenMin: 600 }, "2026-10-28": wide }),
    );
    expect(plan.workDate).toBe("2026-10-28");
  });

  // TM-D15: patokan Clock In = shift yang sedang berjalan.
  test("shift 15–23 tgl 16 sedang berjalan + shift 00–08 tgl 17 sudah buka absen → pukul 22.30 masuk tgl 16 (Telat)", () => {
    const sore = { ...base, startMinute: 15 * 60, endMinute: 23 * 60 };
    const dini = { ...base, startMinute: 0, endMinute: 8 * 60, checkInOpenMin: 120 };
    const days2 = roster({ "2026-10-16": sore, "2026-10-17": dini });
    expect(planCheckIn(at("2026-10-16T22:30:00"), WIB, days2)).toMatchObject({
      workDate: "2026-10-16",
      labels: ["LATE"],
    });
    expect(
      planCheckIn(at("2026-10-16T22:30:00"), WIB, days2, new Set(["2026-10-16"])),
    ).toMatchObject({ workDate: "2026-10-17", labels: [] });
  });

  test("shift 00–08 tanpa centang di roster tgl 17 = tgl 17; Clock In 09.00 sesudah selesai → di luar roster", () => {
    const dini = { ...base, startMinute: 0, endMinute: 8 * 60 };
    const days2 = roster({ "2026-10-16": null, "2026-10-17": dini, "2026-10-18": null });
    expect(planCheckIn(at("2026-10-17T00:10:00"), WIB, days2).workDate).toBe("2026-10-17");
    expect(planCheckIn(at("2026-10-17T09:00:00"), WIB, days2)).toMatchObject({
      workDate: "2026-10-17",
      labels: ["OUTSIDE_ROSTER"],
    });
  });
});

describe("restShortfall: jeda antarshift < 8 jam ditandai", () => {
  const out = (iso: string, status = "APPROVED") => ({
    punches: [{ kind: "OUT", at: at(iso), status }],
  });
  test("pulang 08:00, masuk 15:45 → kurang; masuk 16:30 → cukup", () => {
    expect(restShortfall([out("2026-10-28T08:00:00")], at("2026-10-28T15:45:00"), 8)).toBe(true);
    expect(restShortfall([out("2026-10-28T08:00:00")], at("2026-10-28T16:30:00"), 8)).toBe(false);
  });
  test("absen pulang yang ditolak & pengaturan 0 diabaikan", () => {
    expect(
      restShortfall([out("2026-10-28T08:00:00", "REJECTED")], at("2026-10-28T10:00:00"), 8),
    ).toBe(false);
    expect(restShortfall([out("2026-10-28T08:00:00")], at("2026-10-28T10:00:00"), 0)).toBe(false);
  });
});
