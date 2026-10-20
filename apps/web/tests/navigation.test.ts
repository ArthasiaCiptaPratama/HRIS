import { describe, expect, it } from "vitest";
import { activeGroup, NAV_GROUPS, type NavItem } from "@/app/navigation";

// Setiap item menu harus menyalakan grupnya sendiri di hotbar (regresi: /penerimaan jatuh ke Dashboard).
const flatten = (items: NavItem[]): NavItem[] =>
  items.flatMap((item) => [item, ...flatten(item.children ?? [])]);

describe("navigasi: grup aktif sesuai item", () => {
  for (const group of NAV_GROUPS) {
    for (const item of flatten(group.sections.flatMap((s) => s.items))) {
      it(`${item.to} → grup ${group.id}`, () => {
        expect(activeGroup(NAV_GROUPS, item.to)?.id).toBe(group.id);
        // Sub-halaman (mis. /penerimaan/impor, /penerimaan/:id) tetap di grup yang sama.
        if (item.to !== "/") expect(activeGroup(NAV_GROUPS, `${item.to}/x`)?.id).toBe(group.id);
      });
    }
  }
});

// Master Cuti (kuota per tahun) tidak untuk karyawan biasa (pemilik projek 2026-10-19).
describe("navigasi: Master Cuti", () => {
  const item = flatten(NAV_GROUPS.flatMap((g) => g.sections.flatMap((s) => s.items))).find(
    (i) => i.to === "/time/master-cuti",
  ) as NavItem;
  const me = (role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE") => ({
    id: "a",
    email: "x@example.test",
    role,
    isPrimarySuperAdmin: false,
    employeeId: "e1",
    lastLoginAt: null,
    grants: [],
  });
  it("tersembunyi untuk karyawan; tampil untuk SA, HR, MANAGER", () => {
    expect(item.visible?.(me("EMPLOYEE") as never)).toBe(false);
    for (const role of ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] as const) {
      expect(item.visible?.(me(role) as never)).toBe(true);
    }
  });
});
