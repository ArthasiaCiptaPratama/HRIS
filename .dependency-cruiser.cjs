// Aturan batas modul & layer (PLAN §3.2, PROMPT §4 "Layer dalam modul"). Dicek di CI: bun run check:boundaries
const MODULES = "^apps/api/src/modules/";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---------- Batas modul ----------
    {
      name: "module-only-via-index",
      comment:
        "Modul lain hanya boleh di-import lewat modules/<modul>/index.ts (PLAN §3.2.5, PROMPT §3.3).",
      severity: "error",
      from: { path: `${MODULES}([^/]+)/` },
      to: {
        path: `${MODULES}[^/]+/`,
        pathNot: [`${MODULES}$1/`, `${MODULES}[^/]+/index\\.ts$`],
      },
    },
    {
      name: "outside-only-via-index",
      comment:
        "Kode di luar modul (core, app, jobs, scripts, tests) hanya boleh memakai index.ts modul.",
      severity: "error",
      from: { path: "^apps/api/", pathNot: `${MODULES}` },
      to: { path: `${MODULES}[^/]+/`, pathNot: `${MODULES}[^/]+/index\\.ts$` },
    },

    // ---------- Layer dalam modul ----------
    {
      name: "routes-no-repository",
      comment: "routes tidak boleh query langsung; lewat service (PROMPT §4).",
      severity: "error",
      from: { path: `${MODULES}[^/]+/[^/]+\\.routes\\.ts$` },
      to: { path: "(\\.repository\\.ts$|/core/db\\.ts$|/generated/prisma/)" },
    },
    {
      name: "policy-is-pure",
      comment: "policy = keputusan akses murni; data target diberikan pemanggil (PROMPT §4).",
      severity: "error",
      from: { path: `${MODULES}[^/]+/[^/]+\\.policy\\.ts$` },
      to: {
        path: "(\\.repository\\.ts$|\\.service\\.ts$|\\.routes\\.ts$|/core/db\\.ts$|/generated/prisma/)",
      },
    },
    {
      name: "service-no-http",
      comment: "service tidak tahu Hono/HTTP dan tidak memanggil routes (PROMPT §4).",
      severity: "error",
      from: { path: `${MODULES}[^/]+/[^/]+\\.service\\.ts$` },
      to: { path: "(\\.routes\\.ts$|node_modules/(hono|@hono/))" },
    },
    {
      name: "repository-is-lowest",
      comment: "repository hanya query Prisma; tidak memanggil service/routes/policy (PROMPT §4).",
      severity: "error",
      from: { path: `${MODULES}[^/]+/[^/]+\\.repository\\.ts$` },
      to: { path: "(\\.service\\.ts$|\\.routes\\.ts$|\\.policy\\.ts$)" },
    },
    {
      name: "core-not-into-modules-internals",
      comment: "core adalah hal lintas modul; tidak boleh bergantung pada detail modul.",
      severity: "error",
      from: { path: "^apps/api/src/core/" },
      to: { path: `${MODULES}[^/]+/`, pathNot: `${MODULES}[^/]+/index\\.ts$` },
    },

    // ---------- Batas workspace ----------
    {
      name: "web-not-to-api",
      comment:
        "Frontend berbicara ke API lewat HTTP, bukan import kode api (termasuk client Prisma).",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^apps/api/" },
    },
    {
      name: "api-not-to-web",
      severity: "error",
      from: { path: "^apps/api/" },
      to: { path: "^apps/web/" },
    },
    {
      name: "shared-is-leaf",
      comment: "@hris/shared dipakai FE & BE; tidak boleh bergantung pada apps.",
      severity: "error",
      from: { path: "^packages/shared/" },
      to: { path: "^apps/" },
    },
    {
      name: "web-no-server-secrets",
      comment:
        "Kode server (Prisma, pg, service role) tidak boleh masuk bundle frontend (PROMPT §3.13).",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "node_modules/(@prisma/|prisma/|pg/|dotenv/)" },
    },

    // ---------- Umum ----------
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-dev-dep",
      comment: "Kode produksi tidak boleh bergantung pada devDependencies.",
      severity: "error",
      from: {
        path: "^(apps|packages)/[^/]+/src/",
        pathNot: ["/__tests__/", "\\.test\\.tsx?$"],
      },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
  ],
  options: {
    doNotFollow: { path: "(node_modules|/generated/)" },
    exclude: { path: "^(apps|packages)/[^/]+/(dist|\\.vite)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
