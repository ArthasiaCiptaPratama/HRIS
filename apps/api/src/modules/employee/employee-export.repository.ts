import { getPrisma } from "../../core/db.ts";
import { type EmployeeWhere, LIST_SELECT } from "./employee.repository.ts";
import type { EmployeeExportSection } from "./employee-export.schema.ts";

// Batas dibaca sebelum relasi berulang supaya hasil terlalu besar tidak memuat data sensitif.
export function findExportEmployees(where: EmployeeWhere) {
  return getPrisma().employee.findMany({
    where,
    take: 5001,
    orderBy: [{ fullName: "asc" }, { employeeNumber: "asc" }, { id: "asc" }],
    select: {
      ...LIST_SELECT,
      emergencyPhone: true,
      emergencyContactName: true,
      emergencyContactRelationship: true,
    },
  });
}

export function findExportParts(where: EmployeeWhere, sections: readonly EmployeeExportSection[]) {
  return getPrisma().employee.findMany({
    where,
    orderBy: [{ fullName: "asc" }, { employeeNumber: "asc" }, { id: "asc" }],
    select: {
      ...LIST_SELECT,
      personalEmail: sections.includes("personal"),
      personal: sections.includes("personal"),
      bankAccount: sections.includes("bank"),
      familyMembers: sections.includes("family")
        ? { orderBy: [{ name: "asc" }, { id: "asc" }] }
        : false,
      educations: sections.includes("education")
        ? { orderBy: [{ entryYear: "asc" }, { id: "asc" }] }
        : false,
      trainings: sections.includes("training")
        ? { orderBy: [{ startDate: "asc" }, { id: "asc" }] }
        : false,
      workExperiences: sections.includes("experience")
        ? { orderBy: [{ startYear: "asc" }, { id: "asc" }] }
        : false,
      histories: sections.includes("employment")
        ? { orderBy: [{ effectiveDate: "asc" }, { id: "asc" }] }
        : false,
    },
  });
}
