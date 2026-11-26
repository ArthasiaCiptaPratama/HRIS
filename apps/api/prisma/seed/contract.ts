import { shiftThlMonth, thlCurrentMonth } from "@hris/shared";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import type { OrganizationIds } from "./organization.ts";

// KTR-K1: isolated fictional employees; rerunning the seed preserves lifecycle actions already taken.
export async function seedContracts(prisma: PrismaClient, org: OrganizationIds): Promise<void> {
  const companyId = org.companies.get("ACP");
  const positionId = org.positions.get("HR Staff");
  const pkwt = org.statuses.get("PKWT");
  const probation = org.statuses.get("Karyawan Percobaan");
  if (!companyId || !positionId || !pkwt || !probation)
    throw new Error("Contract seed master data missing");
  const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
  for (const [key, name, kind, stages] of [
    ["1", "Contoh Kontrak Tahap Satu", "PKWT", [["2026-01-01", "2027-12-31"]]],
    [
      "3",
      "Contoh Kontrak Tahap Tiga",
      "PKWT",
      [
        ["2023-01-01", "2024-12-31"],
        ["2025-01-01", "2025-12-31"],
        ["2026-01-01", "2026-12-31"],
      ],
    ],
    ["P", "Contoh Masa Percobaan", "PROBATION", [["2026-11-01", "2027-01-31"]]],
    ["L", "Contoh PKWT Lama Tanpa Kontrak", "PKWT", []],
  ] as const) {
    const employeeNumber = `KTR-DMY-${key}`;
    if (await prisma.employee.findUnique({ where: { employeeNumber } })) continue;
    await prisma.$transaction(async (tx) => {
      const joinDate = date(stages[0]?.[0] ?? "2024-01-01");
      const employee = await tx.employee.create({
        data: {
          employeeNumber,
          fullName: name,
          companyId,
          positionId,
          employmentStatusId: kind === "PROBATION" ? probation : pkwt,
          joinDate,
          pkwttStartDate: kind === "PROBATION" ? joinDate : null,
        },
      });
      await tx.employmentHistory.create({
        data: {
          employeeId: employee.id,
          changeType: "HIRED",
          effectiveDate: joinDate,
          toStatusId: employee.employmentStatusId,
          note: "Data dummy KTR-K1.",
        },
      });
      let previousContractId: string | null = null;
      for (const [index, [startDate, endDate]] of stages.entries()) {
        const contract: { id: string } = await tx.employmentContract.create({
          data: {
            employeeId: employee.id,
            companyId,
            kind,
            sequence: kind === "PKWT" ? index + 1 : null,
            startDate: date(startDate),
            endDate: date(endDate),
            previousContractId,
            status: index === stages.length - 1 ? "ACTIVE" : "EXTENDED",
            closedAt: index === stages.length - 1 ? null : date(endDate),
            note: "Data dummy KTR-K1.",
          },
        });
        await tx.employmentHistory.create({
          data: {
            employeeId: employee.id,
            changeType: "CONTRACT_STAGE_CHANGED",
            effectiveDate: date(startDate),
            toStatusId: employee.employmentStatusId,
            note: "Data dummy KTR-K1.",
          },
        });
        previousContractId = contract.id;
      }
      // KTR-D2 revisi: salinan tahap/akhir kontrak ACTIVE (sumber kebenaran: contract.contracts).
      const last = stages.at(-1);
      if (last)
        await tx.employee.update({
          where: { id: employee.id },
          data: {
            contractStage: kind === "PKWT" ? stages.length : null,
            contractEndDate: date(last[1]),
          },
        });
    });
  }
  await seedThlContracts(prisma, org);
}

/** K4: rolling calendar months WIB; only the two explicitly fictional THL employees. */
async function seedThlContracts(prisma: PrismaClient, org: OrganizationIds) {
  const companyId = org.companies.get("ACP");
  const positionId = org.positions.get("HR Staff");
  const status = await prisma.employmentStatus.findUnique({ where: { category: "DAILY_WORKER" } });
  if (!companyId || !positionId || !status) throw new Error("THL seed master data missing");
  const current = thlCurrentMonth();
  const months = [-3, -2, -1].map((offset) => shiftThlMonth(current, offset));
  const date = (value: string) => new Date(`${value}T00:00:00Z`);
  const joinDate = date(`${shiftThlMonth(current, -6)}-01`);
  for (const [key, name, counts] of [
    ["REQ", "Contoh THL Wajib Diangkat", [22, 22, 22]],
    ["APP", "Contoh THL Mendekati Batas", [14, 21, 22]],
  ] as const) {
    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.upsert({
        where: { employeeNumber: `KTR-DMY-THL-${key}` },
        update: {},
        create: {
          employeeNumber: `KTR-DMY-THL-${key}`,
          fullName: name,
          companyId,
          positionId,
          employmentStatusId: status.id,
          joinDate,
        },
      });
      // Preserve lifecycle actions if a reviewer has already promoted this fictional employee.
      if (!employee.isActive || employee.employmentStatusId !== status.id) return;
      for (const [index, month] of months.entries()) {
        const approved = counts[index] ?? 0;
        for (let day = 1; day <= 24; day++) {
          const workDate = date(`${month}-${String(day).padStart(2, "0")}`);
          const data = {
            employeeId: employee.id,
            companyId,
            workDate,
            status:
              day <= approved
                ? ("APPROVED" as const)
                : index === 2
                  ? ("PENDING" as const)
                  : ("ALPHA" as const),
            labels: [],
          };
          await tx.attendanceDay.upsert({
            where: { employeeId_workDate: { employeeId: employee.id, workDate } },
            create: data,
            update: { status: data.status, labels: [] },
          });
        }
      }
      const wages = [
        { effectiveFrom: employee.joinDate, amount: key === "REQ" ? "140000" : "150000" },
        ...(key === "REQ" ? [{ effectiveFrom: date(`${months[2]}-15`), amount: "160000" }] : []),
      ];
      for (const wage of wages) {
        const data = {
          ...wage,
          employeeId: employee.id,
          companyId,
          note: "Data dummy KTR-K4.",
          createdBy: "00000000-0000-4000-8000-000000000004",
        };
        await tx.dailyWage.upsert({
          where: {
            employeeId_effectiveFrom: {
              employeeId: employee.id,
              effectiveFrom: wage.effectiveFrom,
            },
          },
          create: data,
          update: { amount: wage.amount },
        });
      }
    });
  }
}
