import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApprovalSteps, StepChips } from "@/features/time-management/components/display";
import { type Approval, approvalSchema } from "@/features/time-management/schemas";

// EMP-D8 P1: satu langkah HR memakai kind dari kontrak, bukan asumsi SINGLE = Atasan.
const approval: Approval = {
  id: "request",
  subjectType: "ATTENDANCE_PUNCH",
  subjectId: "punch",
  status: "PENDING",
  createdAt: "2026-11-24T03:30:00Z",
  decidedAt: null,
  canDecide: true,
  canOverride: false,
  steps: [
    {
      kind: "HR",
      decision: "PENDING",
      decidedAt: null,
      note: null,
      isOverride: false,
      myRight: "regular",
    },
  ],
};
describe("EMP-D8 P1: HR-only approval", () => {
  it("accepts the one-step contract and renders HR in the detail", () => {
    const parsed = approvalSchema.parse(approval);
    render(<ApprovalSteps approval={parsed} />);
    expect(screen.getByText("HR")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(within(screen.getByRole("listitem")).getByText("Menunggu")).toBeInTheDocument();
    expect(screen.queryByText("Atasan")).not.toBeInTheDocument();
  });
  it("renders only HR in the compact mobile summary", () => {
    render(<StepChips approval={approval} />);
    expect(screen.getByText("HR")).toBeInTheDocument();
    expect(screen.queryByText("Atasan")).not.toBeInTheDocument();
  });
});
