// Interface publik modul approval (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
export { type ApprovalRouteDeps, registerApprovalRoutes } from "./approval.routes.ts";
export { approvalViewSchema } from "./approval.schema.ts";
export {
  type AfterCommit,
  type ApprovalGuard,
  type ApprovalHandler,
  type ApprovalTx,
  type ApprovalView,
  type CreateApprovalInput,
  cancelApprovalRequest,
  countPendingRequestsForEmployees,
  createApprovalRequest,
  decide as decideApproval,
  type FinalStatus,
  getApprovalViews,
  listActionable,
  reassignPendingManagerSteps,
  registerApprovalGuard,
  registerApprovalHandler,
  releasePendingManagerSteps,
} from "./approval.service.ts";
