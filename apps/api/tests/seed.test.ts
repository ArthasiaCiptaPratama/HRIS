import { describe, expect, test } from "bun:test";
import { EMPLOYEES, fakeKtpNumber, seedWorkEmail } from "../prisma/seed/employee.ts";

describe("seed dummy (PLAN §5.7)", () => {
  test("NIK fiktif 16 digit; tanggal lahir perempuan ditambah 40", () => {
    const budi = EMPLOYEES.find((e) => e.name === "Budi Santoso");
    const dewi = EMPLOYEES.find((e) => e.name === "Dewi Lestari");
    if (!budi || !dewi) throw new Error("seed data changed");
    expect(fakeKtpNumber(budi, 0)).toBe("3171011205840001");
    expect(fakeKtpNumber(dewi, 1)).toBe("3171014311870002");
  });

  test("semua NIK & nomor karyawan unik", () => {
    const ktp = EMPLOYEES.map((e, i) => fakeKtpNumber(e, i));
    expect(new Set(ktp).size).toBe(EMPLOYEES.length);
    expect(new Set(EMPLOYEES.map((e) => e.number)).size).toBe(EMPLOYEES.length);
  });

  test("atasan selalu muncul lebih dulu di daftar", () => {
    const seen = new Set<string>();
    for (const employee of EMPLOYEES) {
      if (employee.managerNumber) expect(seen.has(employee.managerNumber)).toBe(true);
      seen.add(employee.number);
    }
  });

  test("email kerja memakai plus-addressing developer, atau kosong", () => {
    const budi = EMPLOYEES[0];
    if (!budi) throw new Error("seed data changed");
    expect(seedWorkEmail(undefined, budi)).toBeNull();
    expect(seedWorkEmail("dev@example.com", budi)).toBe("dev+dev-budi-0001@example.com");
    expect(() => seedWorkEmail("bukan-email", budi)).toThrow();
  });
});
