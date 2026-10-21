import { OFF_CODE, type RosterTemplateInput } from "@hris/shared";
import { ConflictError, ForbiddenError } from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import type { RequestContext } from "./calendar.service.ts";
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

// TM-D8 — template roster siap pakai. Saat ini hanya JT (Jetty & Loading team): 3 shift × 8 jam (7 jam normal + 1 jam
// lembur rutin, istirahat dibayar di dalam shift), pola 6 kerja + 1 OFF, rotasi maju tiap minggu
// Pagi → Sore → Malam (siklus 21 hari). Hari ke-6 (5 jam) diatur pengguna sendiri di grid roster.

interface ShiftSpec {
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
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
}

export async function applyRosterTemplate(
  ctx: RequestContext,
  input: RosterTemplateInput,
): Promise<RosterTemplateResult> {
  if (!policy.canManageRoster(ctx.actor, input.companyId)) throw new ForbiddenError();
  // Cek bentrok lebih dulu supaya template tidak terpasang setengah.
  const existing = new Set((await repository.listShifts(input.companyId, true)).map((s) => s.code));
  const taken = JT_SHIFTS.filter((s) => existing.has(s.code)).map((s) => s.code);
  if (taken.length > 0) {
    throw new ConflictError(
      `Kode shift ${taken.join(", ")} sudah ada di perusahaan ini; template JT sudah dipasang?`,
    );
  }
  const patterns = await repository.listPatterns(input.companyId);
  if (patterns.some((p) => p.name === JT_PATTERN_NAME)) {
    throw new ConflictError(`Pola "${JT_PATTERN_NAME}" sudah ada.`);
  }

  const shifts: ShiftDto[] = [];
  for (const [i, spec] of JT_SHIFTS.entries()) {
    shifts.push(
      await createShift(ctx, {
        companyId: input.companyId,
        ...spec,
        checkInOpenMin: 60,
        lateToleranceMin: 15,
        earlyLeaveToleranceMin: 15,
        checkOutCloseMin: 240,
        breakMin: 60,
        breakPaid: true,
        regularOvertimeMin: 60,
        color: JT_COLORS[i] ?? null,
      }),
    );
  }
  const pattern = await createPattern(ctx, {
    companyId: input.companyId,
    name: JT_PATTERN_NAME,
    steps: jtPatternSteps(),
  });
  const crews: CrewDto[] = [];
  if (input.workLocationId) {
    // Crew B & C mulai 7 & 14 hari lebih awal di siklus → pada tanggal mulai: A Pagi, B Sore, C Malam.
    for (const [i, name] of JT_CREWS.entries()) {
      crews.push(
        await createCrew(ctx, {
          companyId: input.companyId,
          workLocationId: input.workLocationId,
          name,
          patternId: pattern.id,
          cycleStartDate: isoAddDays(input.cycleStartDate, -7 * i),
        }),
      );
    }
  }
  return { shifts, pattern, crews };
}
