import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSelectedCompany } from "@/features/employee/company-scope";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-060 (web): lampiran Google Drive dari Import — dilanjutkan dari halaman Import, diproses berulang
// sampai antrean habis, alasan dilewati/gagal tampil, coba ulang. Pemrosesan sesungguhnya diuji di api.
const ACP = { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const item = (
  id: string,
  field: string,
  status: "PENDING" | "DONE" | "SKIPPED" | "FAILED",
  reason: string | null = null,
) => ({
  id,
  sourceRow: 2,
  employeeNumber: "ACP-9001",
  fullName: "Ani Contoh",
  field,
  target: field === "attachPhoto" ? "PHOTO" : "KTP",
  fileCount: 1,
  status,
  reason,
});
const state = (items: ReturnType<typeof item>[], driveConfigured = true) => ({
  jobId: "job-1",
  driveConfigured,
  counts: {
    total: items.length,
    pending: items.filter((i) => i.status === "PENDING").length,
    done: items.filter((i) => i.status === "DONE").length,
    skipped: items.filter((i) => i.status === "SKIPPED").length,
    failed: items.filter((i) => i.status === "FAILED").length,
  },
  items,
});

function mockBackend(responses: { process: unknown[]; initial: unknown; retry?: unknown }) {
  const requests: { method: string; path: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const path = url.pathname.replace("/api/v1", "");
      requests.push({ method, path });
      if (path === "/me") return json(200, { data: me("HR_ADMIN") });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/master-data")
        return json(200, {
          data: {
            companies: [ACP],
            departments: [],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (path === "/employee-imports/attachments/open")
        return json(200, {
          data: [
            {
              jobId: "job-1",
              fileName: "form.xlsx",
              createdAt: "2026-10-08T03:00:00.000Z",
              pending: 2,
              failed: 0,
            },
          ],
        });
      if (path === "/employee-imports/job-1/attachments")
        return json(200, { data: responses.initial });
      if (path === "/employee-imports/job-1/attachments/process")
        return json(200, { data: responses.process.shift() });
      if (path === "/employee-imports/job-1/attachments/retry")
        return json(200, { data: responses.retry });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return requests;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  setSelectedCompany(null);
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Lampiran Google Drive di Import", () => {
  it("dilanjutkan dari halaman Import → diproses berulang sampai habis → alasan tampil → coba ulang", async () => {
    const requests = mockBackend({
      initial: state([item("a1", "attachPhoto", "PENDING"), item("a2", "attachKtp", "PENDING")]),
      process: [
        state([item("a1", "attachPhoto", "DONE"), item("a2", "attachKtp", "PENDING")]),
        state([
          item("a1", "attachPhoto", "DONE"),
          item("a2", "attachKtp", "FAILED", "File Drive tidak bisa dibuka"),
        ]),
        state([item("a1", "attachPhoto", "DONE"), item("a2", "attachKtp", "DONE")]),
      ],
      retry: state([item("a1", "attachPhoto", "DONE"), item("a2", "attachKtp", "PENDING")]),
    });
    const user = userEvent.setup();
    renderAt("/personal/import");

    expect(await screen.findByText("Lampiran Google Drive belum selesai")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lanjutkan" }));

    expect(await screen.findByText("File Drive tidak bisa dibuka")).toBeInTheDocument();
    expect(
      screen.getByText(/2 dari 2 lampiran · 1 masuk · 0 dilewati · 1 gagal/),
    ).toBeInTheDocument();
    const processCalls = () =>
      requests.filter((r) => r.path.endsWith("/attachments/process")).length;
    expect(processCalls()).toBe(2);

    await user.click(screen.getByRole("button", { name: /Coba lagi yang gagal/ }));
    await waitFor(() => expect(processCalls()).toBe(3));
    expect(await screen.findByText(/2 masuk · 0 dilewati · 0 gagal/)).toBeInTheDocument();
  });

  it("Drive belum dikonfigurasi: antrean tidak diproses, pesan jelas", async () => {
    const requests = mockBackend({
      initial: state([item("a1", "attachPhoto", "PENDING")], false),
      process: [],
    });
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.click(await screen.findByRole("button", { name: "Lanjutkan" }));
    expect(
      await screen.findByText(/Google Drive belum dikonfigurasi di server/),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith("/attachments/process"))).toBe(false);
  });
});
