import { describe, expect, it } from "vitest";
import {
  collapseBelowDepth,
  hiddenPosts,
  indexChart,
  layoutChart,
  MAX_VISIBLE_SLOTS,
  nodeHeight,
  searchChart,
} from "@/features/employee/org-chart/layout";
import type { OrgChart, OrgChartPost } from "@/features/employee/schemas";

// D-051: tata letak bagan (pohon rapi, tanpa DOM) & bantuan lipat/cari.
const post = (id: string, extra: Partial<OrgChartPost> = {}): OrgChartPost => ({
  id,
  positionName: `Jabatan ${id}`,
  level: null,
  departmentId: "u1",
  corporate: false,
  reportsToId: null,
  functionalReportsToId: null,
  headcount: 1,
  sortOrder: 0,
  holders: [],
  ...extra,
});

const chart: OrgChart = {
  company: { id: "c1", code: "ACP", name: "PT Uji" },
  companies: [{ id: "c1", code: "ACP", name: "PT Uji" }],
  units: [
    { id: "u1", name: "Direksi", unitType: "DIRECTORATE", parentId: null, corporate: false },
    { id: "u2", name: "Corporate", unitType: "DIRECTORATE", parentId: null, corporate: true },
  ],
  posts: [
    post("dir", { holders: [{ id: "p1", fullName: "Budi Contoh", photoUrl: null }] }),
    post("ops", { reportsToId: "dir", sortOrder: 2 }),
    post("adm", { reportsToId: "dir", sortOrder: 1, positionName: "Admin Generalist" }),
    post("ktt", { reportsToId: "ops", functionalReportsToId: "hc" }),
    post("crew", {
      reportsToId: "ktt",
      headcount: 6,
      holders: [
        { id: "p2", fullName: "Sari Uji", photoUrl: null },
        { id: "p3", fullName: "Adi Uji", photoUrl: null },
      ],
    }),
    post("hc", { corporate: true, departmentId: "u2", positionName: "HC Senior Manager" }),
  ],
  unplacedCount: 0,
  canOpenDetail: true,
  canManage: true,
};

describe("indeks & lipat", () => {
  it("anak diurut sortOrder; lipat di bawah kedalaman 1 menyembunyikan cucu", () => {
    const index = indexChart(chart);
    expect(index.children.get("dir")?.map((p) => p.id)).toEqual(["adm", "ops"]);
    const collapsed = collapseBelowDepth(chart, index, 1);
    expect([...collapsed]).toEqual(["ops", "ktt"]);
    expect([...hiddenPosts(index, collapsed)].sort()).toEqual(["crew", "ktt"]);
  });

  it("tinggi kartu mengikuti slot, dibatasi MAX_VISIBLE_SLOTS (+1 baris ringkasan)", () => {
    const one = nodeHeight(post("a"));
    const many = nodeHeight(post("b", { headcount: 50 }));
    expect(many).toBeGreaterThan(one);
    expect(many).toBe(nodeHeight(post("c", { headcount: MAX_VISIBLE_SLOTS + 10 })));
  });
});

describe("cari", () => {
  it("orang lebih dulu, lalu jabatan; tanpa beda huruf besar/aksen; < 2 huruf kosong", () => {
    const index = indexChart(chart);
    expect(searchChart(chart, index, "UJI").map((h) => h.label)).toEqual(["Sari Uji", "Adi Uji"]);
    const hits = searchChart(chart, index, "admin");
    expect(hits[0]).toMatchObject({ postId: "adm", personId: null });
    expect(searchChart(chart, index, "a")).toEqual([]);
    expect(searchChart(chart, index, "jabatan crew")[0]?.detail).toContain("4 kosong");
  });
});

describe("layoutChart", () => {
  it("pohon dari atas ke bawah tanpa tumpang tindih; panel korporat di kanan pohon", () => {
    const index = indexChart(chart);
    const layout = layoutChart(chart, index, new Set());
    const at = new Map(layout.nodes.map((n) => [n.post.id, n]));
    expect(at.get("ops")?.y).toBeGreaterThan(at.get("dir")?.y ?? 0);
    expect(at.get("crew")?.y).toBeGreaterThan(at.get("ktt")?.y ?? 0);
    // Saudara diurut sortOrder: Admin (1) di kiri Ops (2).
    expect(at.get("adm")?.x).toBeLessThan(at.get("ops")?.x ?? 0);
    const boxes = layout.nodes.map((n) => [n.x, n.y, n.x + n.width, n.y + n.height] as const);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const overlap = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
        expect(overlap).toBe(false);
      }
    }
    const mainRight = Math.max(
      ...layout.nodes.filter((n) => !n.post.corporate).map((n) => n.x + n.width),
    );
    expect(layout.corporate?.x).toBeGreaterThan(mainRight);
    expect(at.get("hc")?.x).toBeGreaterThan(layout.corporate?.x ?? 0);
  });

  it("cabang dilipat tidak ikut ditata; tanpa pos korporat → tanpa panel", () => {
    const index = indexChart(chart);
    const layout = layoutChart(chart, index, new Set(["ops"]));
    expect(layout.nodes.map((n) => n.post.id).sort()).toEqual(["adm", "dir", "hc", "ops"]);
    const noCorp = { ...chart, posts: chart.posts.filter((p) => !p.corporate) };
    const plain = layoutChart(noCorp, indexChart(noCorp), new Set());
    expect(plain.corporate).toBeNull();
  });
});
