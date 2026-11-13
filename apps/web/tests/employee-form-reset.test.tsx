import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/app/providers";
import { useMe } from "@/features/auth/api";
import { AuthProvider } from "@/features/auth/auth-provider";
import { EmployeeFormDialog } from "@/features/employee/components/employee-form-dialog";
import type { EmployeeDetail } from "@/features/employee/schemas";
import { authState, me, mockApi } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Temuan staging 2026-11-13: refetch detail saat dialog Ubah data terbuka me-reset isian yang sedang diketik.

const detail = (fullName: string) =>
  ({
    id: "e1",
    employeeNumber: "ACP-2023-0007",
    fullName,
    workEmail: null,
    phoneNumber: "081200000007",
    gender: "MALE",
    joinDate: "2023-08-01",
    endDate: null,
    isActive: true,
    exitReason: null,
    employmentStatus: { id: "s1", name: "PKWT", category: "PKWT" },
    company: { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" },
    position: { id: "p1", name: "GA Staff" },
    department: { id: "d1", name: "Human Resources & GA" },
    workLocation: null,
    homebase: null,
    homebases: [],
    grade: null,
    manager: null,
    orgPostId: null,
    managerOverride: false,
    emergencyPhone: null,
    emergencyContactName: null,
    emergencyContactRelationship: null,
    access: { manage: true, deactivate: false, personal: false, bank: false, print: false },
  }) as unknown as EmployeeDetail;

/** Induk yang mengganti objek `employee` (id sama), seperti hasil refetch di panel detail. */
function Harness() {
  const loaded = useMe().data;
  const [employee, setEmployee] = useState(() => detail("Agus Pratama"));
  const [open, setOpen] = useState(true);
  if (!loaded) return null;
  return (
    <>
      <button type="button" onClick={() => setEmployee(detail("Agus Pratama"))}>
        refetch
      </button>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        toggle
      </button>
      <EmployeeFormDialog open={open} onOpenChange={setOpen} employee={employee} />
    </>
  );
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  mockApi({
    "/me": [200, { data: me("HR_ADMIN") }],
    "/master-data": [
      200,
      {
        data: {
          companies: [],
          departments: [],
          positions: [],
          employmentStatuses: [],
          grades: [],
          workLocations: [],
          homebases: [],
        },
      },
    ],
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Ubah data karyawan: isian tidak di-reset selama dialog terbuka", () => {
  it("objek employee baru (refetch) tidak menimpa No. HP yang sedang diketik; buka ulang = reset", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </QueryClientProvider>,
    );
    const phone = await screen.findByLabelText(/No\. HP/);
    expect(phone).toHaveValue("081200000007");
    await userEvent.clear(phone);
    await userEvent.type(phone, "081299999999");

    fireEvent.click(screen.getByRole("button", { name: "refetch", hidden: true }));
    expect(screen.getByLabelText(/No\. HP/)).toHaveValue("081299999999");

    // Tutup lalu buka lagi → nilai awal dari data karyawan.
    // Tombol uji di luar modal (Radix memblokir pointer) → fireEvent.
    fireEvent.click(screen.getByRole("button", { name: "toggle", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "toggle", hidden: true }));
    expect(await screen.findByLabelText(/No\. HP/)).toHaveValue("081200000007");
  });
});
