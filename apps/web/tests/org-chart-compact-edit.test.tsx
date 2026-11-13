import { render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT } from "@/features/employee/org-chart/edit/draft";
import { EditBar } from "@/features/employee/org-chart/edit/edit-bar";
import {
  COMPACT_EDIT_QUERY,
  useCompactEdit,
} from "@/features/employee/org-chart/edit/use-compact-edit";

// ORG-D6: mode edit bagan di layar < 1024 px / sentuh (tanpa seret, bilah ikon).

function stubMatchMedia(matches: boolean) {
  const queries: string[] = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      queries.push(query);
      return {
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }),
  );
  return queries;
}

afterEach(() => vi.unstubAllGlobals());

const noop = () => {};
const bar = (props: { editing: boolean; compact?: boolean }) => (
  <EditBar
    {...props}
    draft={EMPTY_DRAFT}
    onStart={noop}
    onUndo={noop}
    onRedo={noop}
    onExit={noop}
    onSave={noop}
  />
);

describe("ORG-D6 mode edit layar sempit", () => {
  it("useCompactEdit mengikuti media query lebar < 1024 px / pointer kasar", () => {
    const queries = stubMatchMedia(true);
    expect(renderHook(() => useCompactEdit()).result.current).toBe(true);
    expect(queries).toContain(COMPACT_EDIT_QUERY);
    stubMatchMedia(false);
    expect(renderHook(() => useCompactEdit()).result.current).toBe(false);
  });

  it("tombol Mode edit tidak lagi disembunyikan di layar kecil", () => {
    render(bar({ editing: false }));
    expect(screen.getByRole("button", { name: /Mode edit/ }).className).not.toMatch(/\bhidden\b/);
  });

  it("bilah ringkas: ikon ber-label untuk urungkan, ulangi, keluar, simpan", () => {
    render(bar({ editing: true, compact: true }));
    const toolbar = screen.getByRole("toolbar", { name: "Mode edit bagan" });
    for (const name of [/Urungkan/, /Ulangi/, "Keluar mode edit", "Simpan"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(toolbar).not.toHaveTextContent("Mode edit");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
});
