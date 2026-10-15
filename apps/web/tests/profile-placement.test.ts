import { describe, expect, it } from "vitest";
import { profilePlacement } from "@/features/employee/components/profile-placement";

// Header profil karyawan: Divisi & Departemen dari jenjang unit (D-050), Level dari level jabatan.
const master = {
  departments: [
    { id: "dir", name: "Direktorat Operasional", parentId: null, unitType: "DIRECTORATE" as const },
    { id: "div", name: "Divisi HR & GA", parentId: "dir", unitType: "DIVISION" as const },
    { id: "dep", name: "HR & GA Site", parentId: "div", unitType: "DEPARTMENT" as const },
    { id: "sec", name: "Seksi IR", parentId: "dep", unitType: "SECTION" as const },
    { id: "dep2", name: "Finance", parentId: "dir", unitType: "DEPARTMENT" as const },
  ],
  positions: [
    { id: "p-mgr", level: "MANAGER" as const },
    { id: "p-staff", level: null },
  ],
};
const emp = (departmentId: string | null, positionId = "p-mgr") => ({
  department: departmentId ? { id: departmentId, name: `unit ${departmentId}` } : null,
  position: { id: positionId },
});

describe("profilePlacement", () => {
  it("unit departemen di bawah divisi → keduanya terisi; level dari jabatan", () => {
    expect(profilePlacement(emp("dep"), master)).toEqual({
      division: "Divisi HR & GA",
      department: "HR & GA Site",
      level: "Manager",
    });
  });

  it("unit seksi → naik ke departemen & divisi terdekat", () => {
    expect(profilePlacement(emp("sec"), master)).toMatchObject({
      division: "Divisi HR & GA",
      department: "HR & GA Site",
    });
  });

  it("departemen langsung di bawah direktorat → divisi kosong; unit divisi → departemen kosong", () => {
    expect(profilePlacement(emp("dep2"), master)).toMatchObject({
      division: null,
      department: "Finance",
    });
    expect(profilePlacement(emp("div"), master)).toMatchObject({
      division: "Divisi HR & GA",
      department: null,
    });
  });

  it("master belum termuat / tanpa unit / jabatan tanpa level", () => {
    expect(profilePlacement(emp("dep"), undefined)).toEqual({
      division: null,
      department: "unit dep",
      level: null,
    });
    expect(profilePlacement(emp(null, "p-staff"), master)).toEqual({
      division: null,
      department: null,
      level: null,
    });
  });
});
