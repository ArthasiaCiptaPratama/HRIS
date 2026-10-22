import { describe, expect, test } from "bun:test";
import {
  breakWindow,
  checkGeofence,
  checkOutLabels,
  checkOutOpensAt,
  distanceM,
  localDate,
  planCheckIn,
  shiftWindow,
} from "../attendance-engine.ts";

// D-067/D-070: tanggal kerja shift malam, jendela absen, label, geofence.
const day = {
  startMinute: 7 * 60,
  endMinute: 19 * 60,
  checkInOpenMin: 60,
  lateToleranceMin: 15,
  earlyLeaveToleranceMin: 15,
  checkOutCloseMin: 240,
};
const night = { ...day, startMinute: 19 * 60, endMinute: 7 * 60 };
const WITA = "Asia/Makassar";
const at = (iso: string) => new Date(iso);

describe("waktu shift (WITA)", () => {
  test("shift siang 07:00–19:00 WITA = 23:00–11:00 UTC", () => {
    const w = shiftWindow("2026-10-12", day, WITA);
    expect(w.start.toISOString()).toBe("2026-10-11T23:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-12T11:00:00.000Z");
    expect(localDate(at("2026-10-11T23:30:00Z"), WITA)).toBe("2026-10-12");
  });

  test("shift malam 19:00–07:00 selesai keesokan hari", () => {
    const w = shiftWindow("2026-10-12", night, WITA);
    expect(w.end.toISOString()).toBe("2026-10-12T23:00:00.000Z");
  });
});

describe("planCheckIn", () => {
  const roster = (today: unknown, yesterday: unknown = undefined) => [
    { workDate: "2026-10-11", shift: yesterday as never },
    { workDate: "2026-10-12", shift: today as never },
    { workDate: "2026-10-13", shift: undefined },
  ];

  test("masuk 06:30 WITA untuk shift 07:00 → tepat, tanggal hari itu", () => {
    const plan = planCheckIn(at("2026-10-12T06:30:00+08:00"), WITA, roster(day));
    expect(plan).toMatchObject({ workDate: "2026-10-12", labels: [] });
  });

  test("masuk 07:20 → LATE (toleransi 15 menit)", () => {
    expect(planCheckIn(at("2026-10-12T07:20:00+08:00"), WITA, roster(day)).labels).toEqual([
      "LATE",
    ]);
  });

  test("shift malam: masuk 18:30 tgl 11 → tanggal 11; jam 02:00 tgl 12 masih tanggal kerja 11", () => {
    const early = planCheckIn(at("2026-10-11T18:30:00+08:00"), WITA, [
      { workDate: "2026-10-11", shift: night },
    ]);
    expect(early.workDate).toBe("2026-10-11");
    const late = planCheckIn(at("2026-10-12T02:00:00+08:00"), WITA, roster(null, night));
    expect(late).toMatchObject({ workDate: "2026-10-11", labels: ["LATE"] });
  });

  test("hari OFF → OUTSIDE_ROSTER; tanpa roster → NO_ROSTER; terlalu awal → OUTSIDE_ROSTER", () => {
    expect(planCheckIn(at("2026-10-12T07:00:00+08:00"), WITA, roster(null)).labels).toEqual([
      "OUTSIDE_ROSTER",
    ]);
    expect(planCheckIn(at("2026-10-12T07:00:00+08:00"), WITA, roster(undefined)).labels).toEqual([
      "NO_ROSTER",
    ]);
    expect(planCheckIn(at("2026-10-12T04:00:00+08:00"), WITA, roster(day)).labels).toEqual([
      "OUTSIDE_ROSTER",
    ]);
  });

  test("TM-D12: offDay hanya untuk hari OFF roster (bukan tanpa roster / di luar jendela)", () => {
    expect(planCheckIn(at("2026-10-12T07:00:00+08:00"), WITA, roster(null)).offDay).toBe(true);
    expect(planCheckIn(at("2026-10-12T07:00:00+08:00"), WITA, roster(undefined)).offDay).toBe(
      false,
    );
    expect(planCheckIn(at("2026-10-12T04:00:00+08:00"), WITA, roster(day)).offDay).toBe(false);
    // Shift malam kemarin masih berjalan walau hari ini OFF → bukan hari libur.
    expect(planCheckIn(at("2026-10-12T02:00:00+08:00"), WITA, roster(null, night)).offDay).toBe(
      false,
    );
  });
});

test("checkOutLabels TM-D12: dibuka 30 menit sebelum jam pulang; lebih awal = pulang cepat", () => {
  const w = shiftWindow("2026-10-12", day, WITA);
  expect(checkOutOpensAt(w.end, 30).toISOString()).toBe("2026-10-12T10:30:00.000Z");
  expect(checkOutLabels(at("2026-10-12T18:29:00+08:00"), w, 30)).toEqual(["EARLY_LEAVE"]);
  expect(checkOutLabels(at("2026-10-12T18:30:00+08:00"), w, 30)).toEqual([]);
  expect(checkOutLabels(at("2026-10-12T19:05:00+08:00"), w, 30)).toEqual([]);
  expect(checkOutLabels(at("2026-10-12T23:30:00+08:00"), w, 30)).toEqual(["OUTSIDE_ROSTER"]);
});

describe("breakWindow TM-D12", () => {
  test("shift siang 12:00–13:00 WITA", () => {
    const w = breakWindow(
      "2026-10-12",
      { ...day, breakStartMinute: 12 * 60, breakEndMinute: 13 * 60 },
      WITA,
    );
    expect(w?.opens.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(w?.closes.toISOString()).toBe("2026-10-12T05:00:00.000Z");
  });

  test("shift malam: istirahat 00:00–01:00 jatuh keesokan hari; 23:30–00:30 melintasi tengah malam", () => {
    const after = breakWindow(
      "2026-10-12",
      { ...night, breakStartMinute: 0, breakEndMinute: 60 },
      WITA,
    );
    expect(after?.opens.toISOString()).toBe("2026-10-12T16:00:00.000Z");
    const across = breakWindow(
      "2026-10-12",
      { ...night, breakStartMinute: 23 * 60 + 30, breakEndMinute: 30 },
      WITA,
    );
    expect(across?.opens.toISOString()).toBe("2026-10-12T15:30:00.000Z");
    expect(across?.closes.toISOString()).toBe("2026-10-12T16:30:00.000Z");
  });

  test("tanpa jam istirahat → null (bebas)", () => {
    expect(
      breakWindow("2026-10-12", { ...day, breakStartMinute: null, breakEndMinute: null }, WITA),
    ).toBeNull();
  });
});

describe("geofence", () => {
  const site = { id: "kintap", latitude: -3.85, longitude: 115.3, radiusM: 500 };
  const jetty = { id: "jetty", latitude: -3.9, longitude: 115.4, radiusM: 300 };

  test("jarak haversine masuk akal (± 1,1 km per 0,01°)", () => {
    expect(distanceM({ latitude: 0, longitude: 0 }, { latitude: 0.01, longitude: 0 })).toBe(1112);
  });

  test("di dalam radius; di lokasi lain; di luar semua; akurasi rendah", () => {
    const pos = (latitude: number, longitude: number, accuracyM = 20) => ({
      latitude,
      longitude,
      accuracyM,
    });
    expect(checkGeofence(pos(-3.851, 115.3), site, [site, jetty], 100)).toMatchObject({
      inside: true,
      labels: [],
    });
    expect(checkGeofence(pos(-3.9, 115.4), site, [site, jetty], 100)).toMatchObject({
      workLocationId: "jetty",
      labels: ["OTHER_LOCATION"],
    });
    expect(checkGeofence(pos(-3.7, 115.3), site, [site, jetty], 100).labels).toEqual([
      "OUTSIDE_RADIUS",
    ]);
    expect(checkGeofence(pos(-3.851, 115.3, 250), site, [site], 100).labels).toEqual([
      "LOW_ACCURACY",
    ]);
  });

  // TM-D1 / PLAN §5.4: karyawan bebas lokasi tidak dicek geofence, koordinat & jarak tetap dicatat.
  test("bebas lokasi: tanpa OUTSIDE_RADIUS/OTHER_LOCATION; jarak ke site terdekat tetap dicatat", () => {
    const pos = (latitude: number, longitude: number, accuracyM = 20) => ({
      latitude,
      longitude,
      accuracyM,
    });
    // Jauh dari semua site.
    const far = checkGeofence(pos(-3.7, 115.3), site, [site, jetty], 100, true);
    expect(far).toMatchObject({ workLocationId: null, inside: false, labels: [] });
    expect(far.distanceM).toBeGreaterThan(0);
    // Di dalam site lain (bukan yang "diharapkan") → tercatat di sana tanpa label OTHER_LOCATION.
    expect(checkGeofence(pos(-3.9, 115.4), site, [site, jetty], 100, true)).toMatchObject({
      workLocationId: "jetty",
      inside: true,
      labels: [],
    });
    // Akurasi rendah tetap dilabeli; tanpa site sama sekali → jarak null.
    expect(checkGeofence(pos(-3.7, 115.3, 250), null, [], 100, true)).toEqual({
      workLocationId: null,
      distanceM: null,
      inside: false,
      labels: ["LOW_ACCURACY"],
    });
  });
});
