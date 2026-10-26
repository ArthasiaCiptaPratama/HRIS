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

// IAM-D1: HR Kepegawaian — Personal Management (lihat data kerja) saja; modul lain & Arsip tersembunyi.
describe("navigasi: HR Kepegawaian", () => {
  const me = {
    id: "a",
    email: "hrk@example.test",
    role: "HR_PERSONNEL",
    isPrimarySuperAdmin: false,
    employeeId: null,
    lastLoginAt: null,
    grants: [],
  } as never;
  const visibleItems = (groupId: string) => {
    const group = NAV_GROUPS.find((g) => g.id === groupId);
    if (!group || (group.visible && !group.visible(me))) return [];
    return flatten(group.sections.flatMap((s) => s.items))
      .filter((i) => !i.visible || i.visible(me))
      .map((i) => i.to);
  };
  it("Personal Management: daftar aktif, tidak aktif, struktur; tanpa arsip, kelola, laporan", () => {
    const items = visibleItems("personal");
    expect(items).toContain("/personal/pegawai-tidak-aktif");
    expect(items).toContain("/personal/struktur-organisasi");
    expect(items.some((to) => to.startsWith("/personal/pegawai-aktif"))).toBe(true);
    for (const hidden of [
      "/personal/arsip",
      "/personal/ubah-status",
      "/personal/import",
      "/personal/laporan",
    ]) {
      expect(items.some((to) => to.startsWith(hidden))).toBe(false);
    }
  });
  it("grup lain (Time Management, Administrasi, dst.) tidak menampilkan menu; Akun Saya tetap", () => {
    for (const group of NAV_GROUPS.filter((g) => !["dashboard", "personal", "me"].includes(g.id))) {
      const items = visibleItems(group.id).filter((to) => !to.startsWith("/absen"));
      expect({ group: group.id, items }).toEqual({ group: group.id, items: [] });
    }
  });
});
