// Interface publik modul approval (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
export { type ApprovalRouteDeps, registerApprovalRoutes } from "./approval.routes.ts";
export {
  type ApprovalHandler,
  type ApprovalTx,
  type ApprovalView,
  type CreateApprovalInput,
  cancelApprovalRequest,
  createApprovalRequest,
  decide as decideApproval,
  type FinalStatus,
  getApprovalViews,
  listActionable,
  registerApprovalHandler,
} from "./approval.service.ts";
