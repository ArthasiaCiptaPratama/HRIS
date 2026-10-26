import { describe, expect, test } from "bun:test";
import {
  computeOvertimeDay,
  formatMinutes,
  formulaForPattern,
  hourlyWage,
  type OvertimeDayInput,
  overtimeEquivalentHours,
  overtimePay,
  patternRestWarnings,
  recognizeOvertimeMinutes,
} from "../src/index.ts";

// TM-D6 (grill pemilik projek 2026-10-21): aturan lembur & TM-D7 istirahat.
const at = (hhmm: string, day = "2026-10-21") => Date.parse(`${day}T${hhmm}:00+08:00`);

const office: OvertimeDayInput = {
  dayType: "WORKDAY",
  formula: "FIVE_DAY",
  scheduledStart: at("08:00"),
  scheduledEnd: at("17:00"),
  regularOvertimeMin: 0,
  lateToleranceMin: 15,
  breakMin: 60,
  breakPaid: false,
  breakRequired: true,
  checkIn: at("08:00"),
  checkOut: at("17:00"),
  breakStart: at("12:00"),
  breakEnd: at("13:00"),
};
const jt: OvertimeDayInput = {
  dayType: "WORKDAY",
  formula: "SIX_DAY",
  scheduledStart: at("07:00"),
  scheduledEnd: at("15:00"),
  regularOvertimeMin: 60,
  lateToleranceMin: 15,
  breakMin: 60,
  breakPaid: true,
  breakRequired: false,
  checkIn: at("07:00"),
  checkOut: at("15:00"),
};

describe("pengakuan menit lembur", () => {
  test.each([
    [35, 0],
    [45, 0],
    [59, 0],
    [60, 60],
    [65, 90],
    [110, 120],
    [120, 120],
  ])("%i menit → %i menit", (raw, recognized) => {
    expect(recognizeOvertimeMinutes(raw)).toBe(recognized);
  });
});

describe("jam setara", () => {
  test("hari kerja: 2 jam = 1×1,5 + 1×2 = 3,5", () => {
    expect(overtimeEquivalentHours(120, "WORKDAY", "SIX_DAY")).toBe(3.5);
  });
  test("hari kerja: 1 jam 30 menit = 1,5 + 0,5×2 = 2,5", () => {
    expect(overtimeEquivalentHours(90, "WORKDAY", "SIX_DAY")).toBe(2.5);
  });
  test("hari OFF memakai tarif biasa (risiko diterima): 8 jam = 15,5", () => {
    expect(overtimeEquivalentHours(480, "OFF_DAY", "SIX_DAY")).toBe(15.5);
  });
  test("tanggal merah pola 6 hari: 9 jam = 7×2 + 3 + 4 = 21", () => {
    expect(overtimeEquivalentHours(540, "HOLIDAY", "SIX_DAY")).toBe(21);
  });
  test("tanggal merah pola 5 hari: 10 jam = 8×2 + 3 + 4 = 23", () => {
    expect(overtimeEquivalentHours(600, "HOLIDAY", "FIVE_DAY")).toBe(23);
  });
  test("offset: lembur tambahan setelah 60 menit lembur rutin langsung ×2", () => {
    expect(overtimeEquivalentHours(60, "WORKDAY", "SIX_DAY", 60)).toBe(2);
  });
});

describe("hitung lembur satu hari", () => {
  test("pulang 18.50 → kelebihan 1j50 → diakui 2 jam (3,5 jam setara)", () => {
    const r = computeOvertimeDay({ ...office, checkOut: at("18:50") });
    expect(r.rawMin).toBe(110);
    expect(r.proposedMin).toBe(120);
    expect(r.proposedEquivalentHours).toBe(3.5);
    expect(r.breakLabels).toEqual([]);
  });

  test("istirahat lebih 25 menit + pulang 18.00 → efektif 35 menit → tidak diakui; label BREAK_OVER", () => {
    const r = computeOvertimeDay({ ...office, breakEnd: at("13:25"), checkOut: at("18:00") });
    expect(r.breakOverMin).toBe(25);
    expect(r.debtMin).toBe(25);
    expect(r.proposedMin).toBe(0);
    expect(r.breakLabels).toEqual(["BREAK_OVER"]);
  });

  test("telat 30 menit (lewat toleransi) mengurangi lembur hari itu", () => {
    const r = computeOvertimeDay({ ...office, checkIn: at("08:30"), checkOut: at("19:00") });
    expect(r.lateMin).toBe(30);
    // 120 − 30 = 90 → 90 menit.
    expect(r.proposedMin).toBe(90);
  });

  test("telat dalam toleransi bukan utang", () => {
    const r = computeOvertimeDay({ ...office, checkIn: at("08:10"), checkOut: at("18:00") });
    expect(r.lateMin).toBe(0);
    expect(r.proposedMin).toBe(60);
  });

  test("datang awal ikut dihitung (06.30 masuk, pulang tepat) → 90 menit", () => {
    const r = computeOvertimeDay({ ...office, checkIn: at("06:30") });
    expect(r.earlyMin).toBe(90);
    expect(r.proposedMin).toBe(90);
  });

  test("Clock In di luar jadwal lalu pulang sebelum shift mulai → bukan lembur (temuan E2E 2026-10-21)", () => {
    const r = computeOvertimeDay({
      ...office,
      scheduledStart: at("19:00"),
      scheduledEnd: at("07:00", "2026-10-22"),
      breakRequired: false,
      breakStart: null,
      breakEnd: null,
      checkIn: at("10:18"),
      checkOut: at("10:19"),
    });
    expect(r.earlyMin).toBe(1);
    expect(r.proposedMin).toBe(0);
  });

  test("datang 2 jam sebelum shift & pulang tepat → datang awal 120 menit", () => {
    const r = computeOvertimeDay({ ...office, checkIn: at("06:00"), checkOut: at("17:00") });
    expect(r.earlyMin).toBe(120);
    expect(r.proposedMin).toBe(120);
  });

  test("lupa absen istirahat → dianggap sesuai jatah + label NO_BREAK_PUNCH", () => {
    const r = computeOvertimeDay({
      ...office,
      breakStart: null,
      breakEnd: null,
      checkOut: at("18:00"),
    });
    expect(r.breakLabels).toEqual(["NO_BREAK_PUNCH"]);
    expect(r.proposedMin).toBe(60);
  });

  test("lembur hari OFF di lokasi wajib istirahat tanpa absen istirahat → tanpa label NO_BREAK_PUNCH", () => {
    const r = computeOvertimeDay({
      ...office,
      dayType: "OFF_DAY",
      scheduledStart: null,
      scheduledEnd: null,
      breakStart: null,
      breakEnd: null,
      checkIn: at("08:00"),
      checkOut: at("13:00"),
    });
    expect(r.breakLabels).toEqual([]);
  });

  test("JT pulang tepat: lembur rutin 60 menit (1,5 jam setara), tanpa usulan", () => {
    const r = computeOvertimeDay(jt);
    expect(r.regularMin).toBe(60);
    expect(r.regularShort).toBe(false);
    expect(r.regularEquivalentHours).toBe(1.5);
    expect(r.proposedMin).toBe(0);
  });

  test("JT pulang 14.20: lembur rutin riil 20 menit + regularShort", () => {
    const r = computeOvertimeDay({ ...jt, checkOut: at("14:20") });
    expect(r.regularMin).toBe(20);
    expect(r.regularShort).toBe(true);
    expect(r.proposedMin).toBe(0);
  });

  test("JT pulang 15.20: total 80 menit → 90; tambahan 30 menit ×2 = 1 jam setara", () => {
    const r = computeOvertimeDay({ ...jt, checkOut: at("15:20") });
    expect(r.regularMin).toBe(60);
    expect(r.proposedMin).toBe(30);
    expect(r.proposedEquivalentHours).toBe(1);
  });

  test("JT telat 30 menit: utang memotong lembur rutin (60 → 30)", () => {
    const r = computeOvertimeDay({ ...jt, checkIn: at("07:30") });
    expect(r.regularMin).toBe(30);
    expect(r.proposedMin).toBe(0);
  });

  test("tanggal merah terjadwal JT 8 jam (istirahat dibayar) → 480 menit, 17 jam setara", () => {
    const r = computeOvertimeDay({ ...jt, dayType: "HOLIDAY" });
    expect(r.proposedMin).toBe(480);
    expect(r.proposedEquivalentHours).toBe(17);
    expect(r.flags).toEqual([]);
  });

  test("tanggal merah juga butuh 60 menit penuh", () => {
    const r = computeOvertimeDay({ ...jt, dayType: "HOLIDAY", checkOut: at("07:45") });
    expect(r.proposedMin).toBe(0);
  });

  test("hari OFF tanpa jadwal 8 jam kerja → semua lembur biasa + peringatan batas harian", () => {
    const r = computeOvertimeDay({
      ...office,
      dayType: "OFF_DAY",
      scheduledStart: null,
      scheduledEnd: null,
      breakRequired: false,
      checkIn: at("08:00"),
      checkOut: at("17:00"),
    });
    // 9 jam − istirahat riil 60 menit = 480.
    expect(r.proposedMin).toBe(480);
    expect(r.proposedEquivalentHours).toBe(15.5);
    expect(r.flags).toEqual(["OVER_DAY_LIMIT"]);
  });

  test("lebih dari 4 jam sehari di hari kerja → OVER_DAY_LIMIT", () => {
    const r = computeOvertimeDay({ ...office, checkOut: at("21:30") });
    expect(r.proposedMin).toBe(270);
    expect(r.flags).toEqual(["OVER_DAY_LIMIT"]);
  });
});

describe("pola & rupiah", () => {
  test("JT 21 hari (18 kerja) = pola 6 hari; 5+2 = pola 5 hari", () => {
    const jtSteps = ["P", "P", "P", "P", "P", "P", "OFF"];
    expect(formulaForPattern([...jtSteps, ...jtSteps, ...jtSteps])).toBe("SIX_DAY");
    expect(formulaForPattern(["D", "D", "D", "D", "D", "OFF", "OFF"])).toBe("FIVE_DAY");
    expect(formulaForPattern(null)).toBe("SIX_DAY");
  });
  test("upah 5,7 jt + 1,5 jt → Rp41.618/jam; 3,5 jam setara → Rp145.665", () => {
    expect(hourlyWage(5_700_000, 1_500_000)).toBe(41_618);
    expect(overtimePay(3.5, 5_700_000, 1_500_000)).toBe(145_665);
  });
  test("format menit", () => {
    expect(formatMinutes(90)).toBe("1 jam 30 menit");
    expect(formatMinutes(45)).toBe("45 menit");
    expect(formatMinutes(120)).toBe("2 jam");
  });
});

describe("patternRestWarnings (TM-D13 Fase D)", () => {
  const S1 = { code: "S1", startMinute: 480, endMinute: 960 };
  const S2 = { code: "S2", startMinute: 960, endMinute: 0 };
  const S3 = { code: "S3", startMinute: 0, endMinute: 480, startsNextDay: true };
  test("pola 2-2-2 + 2 OFF aman (jeda ≥ 16 jam)", () => {
    expect(
      patternRestWarnings(["S1", "S1", "S2", "S2", "S3", "S3", "OFF", "OFF"], [S1, S2, S3], 8),
    ).toEqual([]);
  });
  test("S2 lalu S1 keesokan hari hanya 8 jam → aman di 8, kurang di 10", () => {
    expect(patternRestWarnings(["S2", "S1"], [S1, S2], 8)).toEqual([]);
    expect(patternRestWarnings(["S2", "S1"], [S1, S2], 10)).toEqual([
      { index: 0, from: "S2", to: "S1", restHours: 8 },
    ]);
  });
  test("malam (tanpa tanda hari berikutnya) 23–07 lalu pagi 07–15 → 0 jam", () => {
    const night = { code: "N", startMinute: 1380, endMinute: 420 };
    const day = { code: "D", startMinute: 420, endMinute: 900 };
    expect(patternRestWarnings(["N", "D", "OFF"], [night, day], 8)).toEqual([
      { index: 0, from: "N", to: "D", restHours: 0 },
    ]);
  });
});
