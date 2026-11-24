import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type SheetColumn,
  SheetGrid,
  type SheetRowData,
} from "@/features/employee/import/sheet/sheet-grid";

// Temuan uji staging 19 Nov: lompat ke sel di kolom kanan → tabel bergulir, tetapi sel tetap di luar
// layar karena posisi kolom virtual tidak memperhitungkan lebar kolom beku.
const columns: SheetColumn[] = [
  { key: "nama", label: "Nama", width: 200, kind: "readonly" },
  ...Array.from({ length: 20 }, (_, i) => ({
    key: `k${i}`,
    label: `Kolom ${i}`,
    width: 150,
    kind: "text" as const,
  })),
];
const rows: SheetRowData[] = Array.from({ length: 3 }, (_, r) => ({
  key: String(r),
  label: `Baris ${r}`,
  cells: Object.fromEntries(columns.map((c) => [c.key, { text: `${c.key}-${r}` }])),
}));

const box = { clientWidth: 1200, clientHeight: 560, scrollWidth: 5000, scrollHeight: 5000 };
const saved = new Map<string, PropertyDescriptor | undefined>();
const originalScrollTo = HTMLElement.prototype.scrollTo;

describe("SheetGrid lompat ke sel", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(box)) {
      saved.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
    }
  });
  afterEach(() => {
    for (const [key, desc] of saved) {
      if (desc) Object.defineProperty(HTMLElement.prototype, key, desc);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
    HTMLElement.prototype.scrollTo = originalScrollTo;
  });

  it("kolom jauh di kanan digulir sampai tepi kanannya terlihat (lebar kolom beku dihitung)", () => {
    const lefts: number[] = [];
    HTMLElement.prototype.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
      if (typeof opts === "object" && opts.left !== undefined) lefts.push(opts.left);
    }) as typeof HTMLElement.prototype.scrollTo;
    const props = { label: "Uji", columns, rows, onChange: () => {} };
    const { rerender } = render(<SheetGrid {...props} />);
    rerender(<SheetGrid {...props} jumpTo={{ row: 1, column: "k9", nonce: 1 }} />);
    // Kolom k9: 200 (beku) + 9×150 = 1550 s.d. 1700 → gulir 1700 − 1200 = 500
    // (kode lama berhenti di 300: sel masih tertutup 200 px di kanan).
    expect(lefts.at(-1)).toBe(500);
  });
});
