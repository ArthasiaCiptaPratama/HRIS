import { describe, expect, test } from "bun:test";
import { orderInstants } from "../attendance-engine.ts";
import { clampToOrder } from "../overtime.service.ts";

// TM-D17: jam SPL → instan, dan klem jam lembur ke rentang SPL.
const WIB = "Asia/Jakarta";
const at = (iso: string) => new Date(`${iso}+07:00`);
const base = {
  checkInOpenMin: 60,
  lateToleranceMin: 15,
  earlyLeaveToleranceMin: 15,
  checkOutCloseMin: 30,
};
const office = { ...base, startMinute: 8 * 60, endMinute: 17 * 60 };
const night = { ...base, startMinute: 16 * 60, endMinute: 0 };
const iso = (r: ReturnType<typeof orderInstants>) =>
  "error" in r ? r : { startsAt: r.startsAt?.toISOString(), endsAt: r.endsAt?.toISOString() };

describe("orderInstants", () => {
  test("hari kerja 08–17: mulai 06.00 & selesai 20.00 di tanggal kerja", () => {
    expect(
      iso(orderInstants("2026-10-27", office, { startTime: "06:00", endTime: "20:00" }, WIB)),
    ).toEqual({
      startsAt: at("2026-10-27T06:00:00").toISOString(),
      endsAt: at("2026-10-27T20:00:00").toISOString(),
    });
  });

  test("shift 16–24: selesai 02.00 = keesokan harinya", () => {
    expect(
      iso(orderInstants("2026-10-27", night, { startTime: null, endTime: "02:00" }, WIB)),
    ).toEqual({
      startsAt: undefined,
      endsAt: at("2026-10-28T02:00:00").toISOString(),
    });
  });

  test("mulai lebih awal sesudah jam masuk → galat; hari OFF wajib dua jam", () => {
    expect(
      "error" in orderInstants("2026-10-27", office, { startTime: "09:00", endTime: null }, WIB),
    ).toBe(true);
    expect(
      "error" in orderInstants("2026-10-27", null, { startTime: "08:00", endTime: null }, WIB),
    ).toBe(true);
    expect(
      iso(orderInstants("2026-10-27", null, { startTime: "22:00", endTime: "04:00" }, WIB)),
    ).toEqual({
      startsAt: at("2026-10-27T22:00:00").toISOString(),
      endsAt: at("2026-10-28T04:00:00").toISOString(),
    });
  });
});

describe("clampToOrder", () => {
  const t = (hhmm: string) => at(`2026-10-27T${hhmm}:00`).getTime();
  const schedule = { start: t("08:00"), end: t("17:00") };

  test("tanpa SPL: datang awal & pulang lewat dipotong ke jadwal; telat tetap riil", () => {
    expect(clampToOrder(t("06:30"), t("19:00"), schedule, null)).toEqual({
      checkIn: t("08:00"),
      checkOut: t("17:00"),
    });
    expect(clampToOrder(t("08:40"), t("16:00"), schedule, null)).toEqual({
      checkIn: t("08:40"),
      checkOut: t("16:00"),
    });
  });

  test("SPL 07.00–18.00: diakui sampai batas SPL", () => {
    const order = { startsAt: new Date(t("07:00")), endsAt: new Date(t("18:00")) };
    expect(clampToOrder(t("06:30"), t("19:00"), schedule, order)).toEqual({
      checkIn: t("07:00"),
      checkOut: t("18:00"),
    });
  });

  test("hari OFF tanpa SPL → nol jam; dengan SPL → dalam rentang SPL", () => {
    expect(clampToOrder(t("08:00"), t("12:00"), null, null)).toEqual({
      checkIn: t("08:00"),
      checkOut: t("08:00"),
    });
    const order = { startsAt: new Date(t("09:00")), endsAt: new Date(t("11:00")) };
    expect(clampToOrder(t("08:00"), t("12:00"), null, order)).toEqual({
      checkIn: t("09:00"),
      checkOut: t("11:00"),
    });
  });
});
