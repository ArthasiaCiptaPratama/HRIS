import { OFF_CODE, patternRestWarnings, type RosterTemplateInput } from "@hris/shared";
import { ConflictError, ForbiddenError } from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import { type RequestContext, readTimeSettings } from "./calendar.service.ts";
import * as repository from "./roster.repository.ts";
import {
  type CrewDto,
  createCrew,
  createPattern,
  createShift,
  type PatternDto,
  type ShiftDto,
} from "./roster.service.ts";
import { isoAddDays } from "./roster-engine.ts";

// TM-D8 — template roster siap pakai: JT (Jetty & Loading team), 13+1, 5+2. JT: 3 shift × 8 jam (7 jam normal + 1 jam
// lembur rutin, istirahat dibayar di dalam shift), pola 6 kerja + 1 OFF, rotasi maju tiap minggu
// Pagi → Sore → Malam (siklus 21 hari). Hari ke-6 (5 jam) diatur pengguna sendiri di grid roster.

interface ShiftSpec {
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  /** TM-D13: shift 3 = malam setelah tanggal roster. */
  startsNextDay?: boolean;
}

const JT_SHIFTS: ShiftSpec[] = [
  { code: "JTP", name: "JT Pagi", startMinute: 7 * 60, endMinute: 15 * 60 },
  { code: "JTS", name: "JT Sore", startMinute: 15 * 60, endMinute: 23 * 60 },
  { code: "JTM", name: "JT Malam", startMinute: 23 * 60, endMinute: 7 * 60 },
];
const JT_COLORS = ["#f59e0b", "#3b82f6", "#6366f1"];
export const JT_PATTERN_NAME = "JT 6+1 rotasi Pagi-Sore-Malam";
export const JT_CREWS = ["JT Crew A", "JT Crew B", "JT Crew C"];

/** Langkah pola JT: 6 Pagi + OFF, 6 Sore + OFF, 6 Malam + OFF. */
export const jtPatternSteps = () =>
  JT_SHIFTS.flatMap((s) => [...Array<string>(6).fill(s.code), OFF_CODE]);

export interface RosterTemplateResult {
  shifts: ShiftDto[];
  pattern: PatternDto;
  crews: CrewDto[];
  /** TM-D13 Fase D: jeda antarshift di pola yang kurang dari pengaturan (hanya peringatan). */
  restWarnings: string[];
}

interface TemplateSpec {
  shifts: (ShiftSpec & {
    color: string;
    breakMin: number;
    breakPaid: boolean;
    regularOvertimeMin: number;
  })[];
  patternName: string;
  steps: string[];
  crews: { name: string; offsetDays: number }[];
  /** 5+2: siklus harus mulai Senin supaya OFF jatuh Sabtu–Minggu. */
  startOnMonday?: boolean;
}

const OT_SHIFT = { breakMin: 60, breakPaid: true, regularOvertimeMin: 60 };
const TEMPLATES: Record<RosterTemplateInput["template"], TemplateSpec> = {
  JT: {
    shifts: JT_SHIFTS.map((s, i) => ({ ...s, ...OT_SHIFT, color: JT_COLORS[i] ?? "#0f766e" })),
    patternName: JT_PATTERN_NAME,
    steps: jtPatternSteps(),
    crews: JT_CREWS.map((name, i) => ({ name, offsetDays: 7 * i })),
  },
  // TM-D8 (grill 2026-10-21: "seperti JT"): 7 j normal + 1 j lembur rutin, istirahat dibayar.
  // Catatan: 13 hari × 7 j normal per 14 hari ≈ 45,5 j/minggu (> 40 j) — ditampilkan sebagai peringatan.
  ROT_13_1: {
    shifts: [
      {
        code: "R13",
        name: "13+1 Siang",
        startMinute: 7 * 60,
        endMinute: 15 * 60,
        ...OT_SHIFT,
        color: "#0ea5e9",
      },
    ],
    patternName: "13+1 (13 kerja, 1 OFF)",
    steps: [...Array<string>(13).fill("R13"), OFF_CODE],
    crews: [{ name: "13+1 Crew A", offsetDays: 0 }],
  },
  // TM-D13 Fase D: 3 shift × 8 jam nonstop; S3 = malam setelah tanggal roster. Rotasi 2-2-2 + 2 OFF,
  // 4 crew bergeser 2 hari → setiap shift selalu terisi satu crew.
  SHIFT_3X8: {
    shifts: [
      {
        code: "S1",
        name: "Shift 1 (Pagi)",
        startMinute: 8 * 60,
        endMinute: 16 * 60,
        color: "#0ea5e9",
      },
      { code: "S2", name: "Shift 2 (Sore)", startMinute: 16 * 60, endMinute: 0, color: "#f59e0b" },
      {
        code: "S3",
        name: "Shift 3 (Malam)",
        startMinute: 0,
        endMinute: 8 * 60,
        startsNextDay: true,
        color: "#6366f1",
      },
    ].map((s) => ({ ...s, breakMin: 60, breakPaid: true, regularOvertimeMin: 0 })),
    patternName: "3 shift × 8 jam (2-2-2 + 2 OFF)",
    steps: ["S1", "S1", "S2", "S2", "S3", "S3", OFF_CODE, OFF_CODE],
    crews: ["A", "B", "C", "D"].map((c, i) => ({ name: `3 Shift Crew ${c}`, offsetDays: 2 * i })),
  },
  WEEK_5_2: {
    shifts: [
      {
        code: "K52",
        name: "Kantor 08–17",
        startMinute: 8 * 60,
        endMinute: 17 * 60,
        breakMin: 60,
        breakPaid: false,
        regularOvertimeMin: 0,
        color: "#16a34a",
      },
    ],
    patternName: "5+2 (Senin–Jumat)",
    steps: [...Array<string>(5).fill("K52"), OFF_CODE, OFF_CODE],
    crews: [{ name: "5+2 Kantor", offsetDays: 0 }],
    startOnMonday: true,
  },
};

/** Senin pada/sebelum tanggal (YYYY-MM-DD). */
const mondayOf = (date: string) => {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return isoAddDays(date, -dow);
};

export async function applyRosterTemplate(
  ctx: RequestContext,
  input: RosterTemplateInput,
): Promise<RosterTemplateResult> {
  if (!policy.canManageRoster(ctx.actor, input.companyId)) throw new ForbiddenError();
  const spec = TEMPLATES[input.template];
  // Cek bentrok lebih dulu supaya template tidak terpasang setengah.
  const existing = new Set((await repository.listShifts(input.companyId, true)).map((s) => s.code));
  const taken = spec.shifts.filter((s) => existing.has(s.code)).map((s) => s.code);
  if (taken.length > 0) {
    throw new ConflictError(
      `Kode shift ${taken.join(", ")} sudah ada di perusahaan ini; template ini sudah dipasang?`,
    );
  }
  const patterns = await repository.listPatterns(input.companyId);
  if (patterns.some((p) => p.name === spec.patternName)) {
    throw new ConflictError(`Pola "${spec.patternName}" sudah ada.`);
  }

  const shifts: ShiftDto[] = [];
  for (const shift of spec.shifts) {
    const { color, ...rest } = shift;
    shifts.push(
      await createShift(ctx, {
        companyId: input.companyId,
        ...rest,
        checkInOpenMin: 60,
        lateToleranceMin: 15,
        earlyLeaveToleranceMin: 15,
        checkOutCloseMin: 240,
        breakStartMinute: null,
        breakEndMinute: null,
        startsNextDay: rest.startsNextDay ?? false,
        color,
      }),
    );
  }
  const pattern = await createPattern(ctx, {
    companyId: input.companyId,
    name: spec.patternName,
    steps: spec.steps,
  });
  const crews: CrewDto[] = [];
  if (input.workLocationId) {
    const start = spec.startOnMonday ? mondayOf(input.cycleStartDate) : input.cycleStartDate;
    // JT: crew B & C mulai 7 & 14 hari lebih awal → pada tanggal mulai A Pagi, B Sore, C Malam.
    for (const crew of spec.crews) {
      crews.push(
        await createCrew(ctx, {
          companyId: input.companyId,
          workLocationId: input.workLocationId,
          name: crew.name,
          patternId: pattern.id,
          cycleStartDate: isoAddDays(start, -crew.offsetDays),
        }),
      );
    }
  }
  // TM-D13 Fase D: pergantian shift berurutan dengan jeda < pengaturan → peringatan (tidak menolak).
  const restWarnings = patternRestWarnings(
    spec.steps,
    shifts,
    (await readTimeSettings()).minRestHours,
  ).map(
    (w) =>
      `Langkah ${w.index + 1}→${w.index + 2}: ${w.from} lalu ${w.to} hanya ${w.restHours} jam istirahat.`,
  );
  return { shifts, pattern, crews, restWarnings };
}
