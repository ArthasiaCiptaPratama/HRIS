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
