import { getPrisma } from "../../src/core/db.ts";

type Call = (
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
) => Response | Promise<Response>;

/**
 * TM-D24: setujui semua perubahan roster yang menunggu untuk karyawan uji (atasan lalu HR lain), supaya test
 * yang menyiapkan roster lewat kuas / import untuk karyawan ber-crew tetap menguji alur aslinya.
 */
export async function approvePendingRosterEdits(
  call: Call,
  employeeIds: string[],
  approvers: Record<string, string>[],
): Promise<number> {
  const prisma = getPrisma();
  const edits = await prisma.rosterEditRequest.findMany({
    where: { employeeId: { in: employeeIds }, status: "PENDING" },
    select: { id: true },
  });
  const approvals = await prisma.approvalRequest.findMany({
    where: { subjectType: "ROSTER_EDIT", subjectId: { in: edits.map((e) => e.id) } },
    select: { id: true },
  });
  for (const approval of approvals) {
    for (const headers of approvers) {
      const res = await call("POST", `/approvals/${approval.id}/decision`, headers, {
        decision: "APPROVED",
      });
      if (res.status !== 200) {
        throw new Error(
          `Keputusan approval ${approval.id} gagal ${res.status}: ${await res.text()}`,
        );
      }
    }
  }
  return approvals.length;
}
