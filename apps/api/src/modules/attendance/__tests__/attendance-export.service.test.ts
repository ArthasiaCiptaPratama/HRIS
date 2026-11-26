import { describe, expect, test } from "bun:test";
import {
  ATTENDANCE_EXPORT_COLUMN_GROUP_INFO,
  ATTENDANCE_EXPORT_COLUMN_GROUPS,
  ATTENDANCE_EXPORT_IDENTITY_COLUMNS,
  ATTENDANCE_EXPORT_MAX_BASE64_BYTES,
} from "@hris/shared";
import { BusinessRuleError } from "../../../core/errors.ts";
import {
  assertExportSize,
  crewSheetNames,
  type DetailRow,
  detailColumns,
  detailSheets,
  type ExportPunch,
  lateEarly,
  locationText,
  mapCell,
  reasonText,
  rosterOnlyStatus,
  statusBucket,
  summarize,
} from "../attendance-export.service.ts";

// TM-D31 — bagian murni ekspor Excel data absen.
const punch = (over: Partial<ExportPunch> = {}): ExportPunch => ({
  kind: "IN",
  at: new Date("2026-11-10T00:00:00Z"),
  latitude: -2.5,
  longitude: 115.25,
  distanceM: 12,
  workLocationId: "site",
  insideGeofence: true,
  labels: [],
  status: "APPROVED",
  source: "DEVICE",
  ...over,
});
const site = (id: string) => (id === "site" ? "Site PIT" : undefined);

describe("locationText", () => {
  test("dalam radius / lokasi lain / di luar radius", () => {
    expect(locationText(punch(), site)).toBe("Site PIT (dalam radius)");
    expect(locationText(punch({ labels: ["OTHER_LOCATION"] }), site)).toBe(
      "Site PIT (lokasi lain)",
    );
    expect(
      locationText(
        punch({ insideGeofence: false, distanceM: 1350, labels: ["OUTSIDE_RADIUS"] }),
        site,
      ),
    ).toBe("1.350 m dari Site PIT (di luar radius)");
    expect(
      locationText(
        punch({ insideGeofence: false, workLocationId: null, labels: ["OUTSIDE_RADIUS"] }),
        site,
      ),
    ).toBe("Di luar radius");
  });
  test("bebas lokasi (TM-D1), tanpa lokasi, input manual", () => {
    expect(locationText(punch({ insideGeofence: false, workLocationId: null }), site)).toBe(
      "Bebas lokasi (di luar site)",
    );
    expect(locationText(punch({ latitude: null, longitude: null }), site)).toBe("Tanpa lokasi");
    expect(locationText(punch({ source: "MANUAL" }), site)).toBe("Input manual HR (Site PIT)");
    expect(locationText(punch({ source: "MANUAL", workLocationId: null }), site)).toBe(
      "Input manual HR",
    );
  });
  test("tidak pernah menampilkan angka koordinat", () => {
    for (const p of [punch(), punch({ insideGeofence: false, workLocationId: null })]) {
      expect(locationText(p, site)).not.toContain("115");
    }
  });
});

describe("mapCell", () => {
  test("tautan hanya bila koordinat ada", () => {
    expect(mapCell(punch())).toEqual({
      value: "Buka di Google Maps",
      link: "https://www.google.com/maps?q=-2.5,115.25",
    });
    expect(mapCell(punch({ latitude: null }))).toBeNull();
    expect(mapCell(undefined)).toBeNull();
  });
});

describe("crewSheetNames", () => {
  const code = (id: string) => ({ A: "ACP", B: "BKP" })[id];
  test("nama kembar antar-PT diberi kode PT; dihapus diberi akhiran; ≤ 31 karakter & unik", () => {
    const names = crewSheetNames(
      [
        { id: "1", name: "Crew A", companyId: "A", deleted: false },
        { id: "2", name: "crew a", companyId: "B", deleted: false },
        { id: "3", name: "Crew Lama", companyId: "A", deleted: true },
        { id: "4", name: "Ringkasan", companyId: "A", deleted: false },
        {
          id: "5",
          name: "Crew/Shift [Pit]: sangat panjang sekali namanya",
          companyId: "A",
          deleted: true,
        },
        {
          id: "6",
          name: "Crew/Shift [Pit]: sangat panjang sekali namanya juga",
          companyId: "A",
          deleted: true,
        },
      ],
      code,
    );
    expect(names.get("1")).toEqual({ label: "Crew A - ACP", sheet: "Crew A - ACP" });
    expect(names.get("2")).toEqual({ label: "crew a - BKP", sheet: "crew a - BKP" });
    expect(names.get("3")).toEqual({ label: "Crew Lama (dihapus)", sheet: "Crew Lama (dihapus)" });
    expect(names.get("4")?.sheet).toBe("Ringkasan (2)");
    const long = [names.get("5")?.sheet, names.get("6")?.sheet] as string[];
    for (const s of long) {
      expect(s.length).toBeLessThanOrEqual(31);
      expect(s).not.toMatch(/[:\\/?*[\]]/);
      expect(s).toContain("(dihapus)");
    }
    expect(new Set(long.map((s) => s.toLowerCase())).size).toBe(2);
  });
});

describe("status & ringkasan", () => {
  test("hari roster tanpa absen", () => {
    const today = "2026-11-20";
    expect(rosterOnlyStatus({ work: false, timeOff: false, date: "2026-11-01" }, today)).toBe(
      "OFF",
    );
    expect(rosterOnlyStatus({ work: false, timeOff: true, date: "2026-11-01" }, today)).toBe(
      "Time off",
    );
    expect(rosterOnlyStatus({ work: true, timeOff: false, date: "2026-11-19" }, today)).toBe(
      "Tanpa absen",
    );
    expect(rosterOnlyStatus({ work: true, timeOff: false, date: today }, today)).toBe(
      "Belum absen",
    );
    expect(rosterOnlyStatus({ work: true, timeOff: false, date: "2026-11-21" }, today)).toBe(
      "Terjadwal",
    );
  });

  const row = (over: Partial<DetailRow>): DetailRow => ({
    employeeId: "e1",
    nip: "N1",
    name: "Budi",
    position: "Operator",
    division: "Produksi",
    date: "2026-11-10",
    crewId: "c1",
    crewLabel: "Crew A",
    shift: "D",
    scheduledIn: "07:00",
    scheduledOut: "19:00",
    clockIn: "",
    locationIn: "",
    mapIn: null,
    clockOut: "",
    locationOut: "",
    mapOut: null,
    status: "",
    label: "",
    approvalIn: "",
    approvalOut: "",
    breakStart: "",
    breakEnd: "",
    lateMin: null,
    earlyMin: null,
    reason: "",
    bucket: "NO_RECORD",
    work: true,
    dayStatus: null,
    labelCodes: [],
    ...over,
  });

  test("definisi sejalan rekap bulanan", () => {
    const rows = [
      row({ date: "2026-11-01", dayStatus: "APPROVED", labelCodes: ["LATE"] }),
      row({ date: "2026-11-02", dayStatus: "PENDING", labelCodes: ["EARLY_LEAVE"] }),
      row({ date: "2026-11-03", dayStatus: "OPEN" }),
      row({ date: "2026-11-04", dayStatus: "REJECTED" }),
      row({ date: "2026-11-05", dayStatus: "ALPHA" }),
      row({ date: "2026-11-06", dayStatus: "LEAVE" }),
      row({ date: "2026-11-07" }),
      row({ date: "2026-11-20" }),
      row({ date: "2026-11-08", work: false }),
      row({ date: "2026-11-09", work: false, dayStatus: "APPROVED" }),
    ];
    expect(summarize(rows, "2026-11-20")).toEqual({
      workDays: 8,
      present: 2,
      pending: 2,
      rejected: 1,
      late: 1,
      earlyLeave: 1,
      alpha: 1,
      leave: 1,
      noRecord: 1,
    });
  });

  test("sheet: Ringkasan, crew, Tanpa crew; pindah crew = dua baris ringkasan; urut Nama lalu Tanggal", () => {
    const rows = [
      row({ date: "2026-11-02", name: "Budi" }),
      row({ date: "2026-11-01", name: "Budi" }),
      row({ date: "2026-11-01", name: "Adi", employeeId: "e2", nip: "N2" }),
      row({ date: "2026-11-03", name: "Budi", crewId: "c2", crewLabel: "Crew B" }),
      row({ date: "2026-11-04", name: "Budi", crewId: null, crewLabel: "Tanpa crew" }),
    ];
    const names = new Map([
      ["c1", { label: "Crew A", sheet: "Crew A" }],
      ["c2", { label: "Crew B", sheet: "Crew B" }],
    ]);
    const sheets = detailSheets(rows, names, ["c1", "c2"], true, ["info"], "2026-11-20");
    expect(sheets.map((s) => s.name)).toEqual(["Ringkasan", "Crew A", "Crew B", "Tanpa crew"]);
    const summary = sheets[0]?.rows.slice(1).map((r) => `${r[1]}|${r[2]}`);
    expect(summary).toEqual(["Adi|Crew A", "Budi|Crew A", "Budi|Crew B", "Budi|Tanpa crew"]);
    const crewA = sheets[1]?.rows ?? [];
    // 16 kolom TM-D31 + Jabatan & Divisi (Identitas TM-D34).
    expect(crewA[0]).toHaveLength(18);
    expect(
      crewA.slice(1).map((r) => `${r[1]}|${(r[5] as Date).toISOString().slice(0, 10)}|${r[6]}`),
    ).toEqual(["Adi|2026-11-01|Minggu", "Budi|2026-11-01|Minggu", "Budi|2026-11-02|Senin"]);
    expect(detailSheets(rows, names, ["c1"], false, [], "2026-11-20").map((s) => s.name)).toEqual([
      "Ringkasan",
      "Crew A",
    ]);
  });
});

describe("TM-D34: kelompok kolom, status baris, telat & pulang cepat, alasan", () => {
  test("kolom: Identitas selalu; urutan bawaan = TM-D31 + Jabatan & Divisi; info shared sama dengan header", () => {
    const headers = (groups: string[]) =>
      detailColumns(new Set(groups as never)).map((c) => c.header);
    expect(headers([])).toEqual([...ATTENDANCE_EXPORT_IDENTITY_COLUMNS]);
    expect(headers(["SCHEDULE", "CLOCK", "LOCATION", "LABEL", "SUMMARY"])).toEqual([
      "NIP",
      "Nama",
      "Jabatan",
      "Divisi",
      "Crew",
      "Tanggal",
      "Hari",
      "Shift",
      "Jadwal Masuk",
      "Jadwal Pulang",
      "Clock In",
      "Lokasi Clock In",
      "Peta In",
      "Clock Out",
      "Lokasi Clock Out",
      "Peta Out",
      "Status",
      "Label",
    ]);
    for (const group of ATTENDANCE_EXPORT_COLUMN_GROUPS) {
      const own = headers([group]).slice(ATTENDANCE_EXPORT_IDENTITY_COLUMNS.length);
      expect([...own].sort()).toEqual(
        [...ATTENDANCE_EXPORT_COLUMN_GROUP_INFO[group].columns].sort(),
      );
    }
    expect(headers([...ATTENDANCE_EXPORT_COLUMN_GROUPS])).toHaveLength(25);
  });

  test("sheet tanpa Ringkasan; tanpa baris & tanpa Ringkasan tetap satu sheet header", () => {
    const names = new Map([["c1", { label: "Crew A", sheet: "Crew A" }]]);
    const r: DetailRow[] = [];
    expect(
      detailSheets(r, names, ["c1"], false, [], "2026-11-20", new Set(["CLOCK"])).map(
        (x) => x.name,
      ),
    ).toEqual(["Crew A"]);
    const empty = detailSheets(r, new Map(), [], false, [], "2026-11-20", new Set());
    expect(empty.map((x) => x.name)).toEqual(["Data Absen"]);
    expect(empty[0]?.rows).toEqual([[...ATTENDANCE_EXPORT_IDENTITY_COLUMNS]]);
  });

  test("statusBucket", () => {
    expect(statusBucket("OPEN", true)).toBe("PENDING");
    expect(statusBucket("PENDING", true)).toBe("PENDING");
    expect(statusBucket("APPROVED", false)).toBe("APPROVED");
    expect(statusBucket("REJECTED", true)).toBe("REJECTED");
    expect(statusBucket("ALPHA", true)).toBe("ALPHA");
    expect(statusBucket("LEAVE", true)).toBe("LEAVE");
    expect(statusBucket(null, true)).toBe("NO_RECORD");
    expect(statusBucket(null, false)).toBe("OFF");
  });

  test("telat & pulang cepat hanya bila berlabel; menit dari jadwal, dibulatkan ke bawah", () => {
    const at = (hhmmss: string) => new Date(`2026-11-10T${hhmmss}Z`);
    const base = {
      clockIn: at("07:12:40"),
      clockOut: at("16:30:00"),
      scheduledStart: at("07:00:00"),
      scheduledEnd: at("17:00:00"),
    };
    expect(lateEarly({ ...base, codes: [] })).toEqual({ lateMin: null, earlyMin: null });
    expect(lateEarly({ ...base, codes: ["LATE", "EARLY_LEAVE"] })).toEqual({
      lateMin: 12,
      earlyMin: 30,
    });
    expect(lateEarly({ ...base, codes: ["LATE"], clockIn: null })).toEqual({
      lateMin: null,
      earlyMin: null,
    });
    expect(lateEarly({ ...base, codes: ["LATE"], scheduledStart: undefined }).lateMin).toBeNull();
    // Data janggal (berlabel tapi tidak telat) tidak menjadi negatif.
    expect(lateEarly({ ...base, codes: ["LATE"], clockIn: at("06:50:00") }).lateMin).toBe(0);
  });

  test("alasan: urut Clock In → istirahat → Clock Out, spasi dirapikan, kosong dilewati", () => {
    expect(
      reasonText([
        { kind: "OUT", reason: "Pulang  cepat\nsakit" },
        { kind: "BREAK_START", reason: null },
        { kind: "IN", reason: " Ban bocor " },
        { kind: "BREAK_END", reason: "   " },
      ]),
    ).toBe("Clock In: Ban bocor; Clock Out: Pulang cepat sakit");
    expect(reasonText([])).toBe("");
  });
});

describe("TM-D34: penjaga ukuran file", () => {
  test("di batas lolos, melewati batas → BusinessRuleError (422) dengan saran", () => {
    expect(ATTENDANCE_EXPORT_MAX_BASE64_BYTES).toBe(4 * 1024 * 1024);
    expect(() => assertExportSize(ATTENDANCE_EXPORT_MAX_BASE64_BYTES)).not.toThrow();
    expect(() => assertExportSize(ATTENDANCE_EXPORT_MAX_BASE64_BYTES + 1)).toThrow(
      BusinessRuleError,
    );
    expect(() => assertExportSize(10, 10)).not.toThrow();
    expect(() => assertExportSize(11, 10)).toThrow("matikan kolom Alasan");
  });
});
