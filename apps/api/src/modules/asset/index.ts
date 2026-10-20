// Interface publik modul asset (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.

export { type AssetRouteDeps, registerAssetRoutes } from "./asset.routes.ts";
export { runAssetDaily } from "./asset-daily.service.ts";
export {
  listAssetsForReport,
  listUnreturnedPpeForReport,
  type ReportAsset,
  type ReportUnreturnedPpe,
} from "./report-data.service.ts";
