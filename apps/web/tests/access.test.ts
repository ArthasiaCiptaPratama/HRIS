import { describe, expect, it } from "vitest";
import { access } from "@/lib/access";
import { me } from "./helpers";

// Harus sejalan dengan apps/api/src/modules/iam/iam.policy.ts (PLAN §4.3–§4.4, D-034).
describe("lib/access (UI) sejalan dengan policy API", () => {
  it("daftar akun: SA & HR saja", () => {
    expect(access.listAccounts(me("SUPER_ADMIN"))).toBe(true);
    expect(access.listAccounts(me("HR_ADMIN"))).toBe(true);
    expect(access.listAccounts(me("MANAGER"))).toBe(false);
  });

  it("role undangan: Utama semua; SA tanpa SUPER_ADMIN; HR hanya EMPLOYEE", () => {
    expect(access.inviteRoles(me("SUPER_ADMIN", true))).toContain("SUPER_ADMIN");
    expect(access.inviteRoles(me("SUPER_ADMIN"))).not.toContain("SUPER_ADMIN");
    expect(access.inviteRoles(me("HR_ADMIN"))).toEqual(["EMPLOYEE"]);
    expect(access.inviteRoles(me("EMPLOYEE"))).toEqual([]);
  });

  it("nonaktif: HR hanya EMPLOYEE/MANAGER; bukan diri sendiri; bukan Utama", () => {
    const hr = me("HR_ADMIN");
    expect(access.setActive(hr, { id: "x", role: "MANAGER", isPrimarySuperAdmin: false })).toBe(
      true,
    );
    expect(access.setActive(hr, { id: "x", role: "HR_ADMIN", isPrimarySuperAdmin: false })).toBe(
      false,
    );
    expect(access.setActive(hr, { id: hr.id, role: "HR_ADMIN", isPrimarySuperAdmin: false })).toBe(
      false,
    );
    expect(
      access.setActive(me("SUPER_ADMIN"), {
        id: "x",
        role: "SUPER_ADMIN",
        isPrimarySuperAdmin: false,
      }),
    ).toBe(false);
    expect(
      access.setActive(me("SUPER_ADMIN", true), {
        id: "x",
        role: "SUPER_ADMIN",
        isPrimarySuperAdmin: true,
      }),
    ).toBe(false);
  });

  it("grant & audit hanya SA; serah-terima hanya Utama", () => {
    expect(access.manageGrants(me("HR_ADMIN"))).toBe(false);
    expect(access.readAuditLogs(me("SUPER_ADMIN"))).toBe(true);
    expect(access.transferPrimary(me("SUPER_ADMIN"))).toBe(false);
    expect(access.transferPrimary(me("SUPER_ADMIN", true))).toBe(true);
  });
});
