import * as repository from "./employee.repository.ts";

/** Same history path for employee edits and chart placements (ORG-D2). */
export async function recordPositionChange(
  tx: repository.EmployeeTx,
  employeeId: string,
  fromPositionId: string,
  toPositionId: string | undefined,
  changedBy: string,
  now = new Date(),
): Promise<void> {
  if (!toPositionId || toPositionId === fromPositionId) return;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  await repository.createHistory(tx, {
    employeeId,
    changeType: "POSITION_CHANGED",
    effectiveDate: new Date(`${date}T00:00:00.000Z`),
    fromPositionId,
    toPositionId,
    changedBy,
  });
}
