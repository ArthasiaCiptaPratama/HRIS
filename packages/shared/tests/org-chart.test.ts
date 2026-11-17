import { describe, expect, test } from "bun:test";
import {
  canReportTo,
  orgPostInputSchema,
  resolvePostManagers,
  unitZones,
  wouldCreatePostCycle,
} from "../src/org-chart.ts";

// D-051/D-052/D-053: aturan pos jabatan & org chart yang dipakai bersama API & web.
const ID = {
  dir: "00000000-0000-4000-8000-000000000001",
  ktt: "00000000-0000-4000-8000-000000000002",
  wakil: "00000000-0000-4000-8000-000000000003",
  op: "00000000-0000-4000-8000-000000000004",
  asst: "00000000-0000-4000-8000-000000000005",
  helper: "00000000-0000-4000-8000-000000000006",
};

describe("orgPostInputSchema", () => {
  test("bawaan slot 1 & urutan 0; kode dijadikan huruf besar", () => {
    expect(orgPostInputSchema.parse({ positionId: ID.dir, code: " acp-dirut " })).toMatchObject({
      code: "ACP-DIRUT",
      headcount: 1,
      sortOrder: 0,
    });
  });

  test("slot di luar 1–50, kode bertanda aneh, atasan = atasan fungsional ditolak", () => {
    expect(orgPostInputSchema.safeParse({ positionId: ID.dir, headcount: 0 }).success).toBe(false);
    expect(orgPostInputSchema.safeParse({ positionId: ID.dir, headcount: 51 }).success).toBe(false);
    expect(orgPostInputSchema.safeParse({ positionId: ID.dir, code: "A B" }).success).toBe(false);
    expect(
      orgPostInputSchema.safeParse({
        positionId: ID.dir,
        reportsToId: ID.ktt,
        functionalReportsToId: ID.ktt,
      }).success,
    ).toBe(false);
  });
});

describe("wouldCreatePostCycle", () => {
  const posts = [
    { id: ID.dir, reportsToId: null },
    { id: ID.ktt, reportsToId: ID.dir },
    { id: ID.wakil, reportsToId: ID.ktt },
    { id: ID.op, reportsToId: ID.wakil },
  ];

  test("menjadikan bawahan (langsung/tidak langsung) sebagai atasan = siklus", () => {
    expect(wouldCreatePostCycle(posts, ID.ktt, ID.op)).toBe(true);
    expect(wouldCreatePostCycle(posts, ID.dir, ID.wakil)).toBe(true);
    expect(wouldCreatePostCycle(posts, ID.ktt, ID.ktt)).toBe(true);
  });

  test("atasan di cabang lain atau tanpa atasan = bukan siklus", () => {
    expect(wouldCreatePostCycle(posts, ID.op, ID.ktt)).toBe(false);
    expect(wouldCreatePostCycle(posts, ID.op, null)).toBe(false);
  });
});

describe("canReportTo (D-052: pos milik PT, unit tanpa PT = fungsi korporat grup)", () => {
  const acp = { companyId: "acp" };
  const cd2 = { companyId: "cd2" };
  const corp = { companyId: null };

  test("garis tegas hanya dalam PT yang sama (korporat ke korporat)", () => {
    expect(canReportTo(acp, acp, "solid")).toBe(true);
    expect(canReportTo(corp, corp, "solid")).toBe(true);
    expect(canReportTo(acp, cd2, "solid")).toBe(false);
    expect(canReportTo(acp, corp, "solid")).toBe(false);
    expect(canReportTo(corp, acp, "solid")).toBe(false);
  });

  test("garis putus-putus boleh ke PT sendiri atau ke fungsi korporat", () => {
    expect(canReportTo(acp, acp, "functional")).toBe(true);
    expect(canReportTo(acp, corp, "functional")).toBe(true);
    expect(canReportTo(acp, cd2, "functional")).toBe(false);
  });
});

describe("resolvePostManagers (ORG-D9)", () => {
  const posts = [
    { id: ID.dir, reportsToId: null },
    { id: ID.ktt, reportsToId: ID.dir },
    { id: ID.wakil, reportsToId: ID.ktt },
    { id: ID.op, reportsToId: ID.wakil },
    { id: ID.asst, reportsToId: ID.op },
    { id: ID.helper, reportsToId: ID.asst },
  ];
  const h = (employeeId: string, postId: string, employeeNumber: string | null = employeeId) => ({
    employeeId,
    employeeNumber,
    postId,
  });

  test("atasan = pemegang pos tepat di atasnya, apa pun role/akunnya; pos kosong dilewati", () => {
    const result = resolvePostManagers({
      posts,
      holders: [
        h("e-dir", ID.dir),
        h("e-ktt", ID.ktt),
        h("e-op", ID.op),
        h("e-asst", ID.asst),
        h("e-helper", ID.helper),
      ],
    });
    expect(result.get("e-dir")).toBeNull();
    expect(result.get("e-ktt")).toBe("e-dir");
    // Wakil KTT kosong → naik ke KTT.
    expect(result.get("e-op")).toBe("e-ktt");
    expect(result.get("e-asst")).toBe("e-op");
    // Assisten tetap atasan Helper walau tidak ber-akun Manager (D-053 lama melewatinya).
    expect(result.get("e-helper")).toBe("e-asst");
  });

  test("pos atas berisi banyak orang: NIK terkecil, tidak bergantung urutan masukan", () => {
    const twoPosts = [
      { id: ID.dir, reportsToId: null },
      { id: ID.ktt, reportsToId: ID.dir },
    ];
    const holders = [
      h("a", ID.dir, "2608.ACP.050"),
      h("b", ID.dir, "2608.ACP.007"),
      h("c", ID.ktt, "2608.ACP.100"),
      h("d", ID.dir, null),
    ];
    for (const order of [holders, [...holders].reverse()]) {
      const result = resolvePostManagers({ posts: twoPosts, holders: order });
      expect(result.get("c")).toBe("b");
      // Sesama pemegang pos teratas tidak saling menjadi atasan.
      expect(result.get("a")).toBeNull();
      expect(result.get("b")).toBeNull();
      expect(result.get("d")).toBeNull();
    }
  });

  test("tidak menunjuk diri sendiri walau memegang pos atas juga", () => {
    const result = resolvePostManagers({
      posts: [
        { id: ID.dir, reportsToId: null },
        { id: ID.ktt, reportsToId: ID.dir },
      ],
      holders: [h("x", ID.ktt), h("x", ID.dir)],
    });
    expect(result.get("x")).toBeNull();
  });

  test("data rusak berbentuk siklus tidak membuat loop tanpa akhir", () => {
    const result = resolvePostManagers({
      posts: [
        { id: ID.dir, reportsToId: ID.ktt },
        { id: ID.ktt, reportsToId: ID.dir },
      ],
      holders: [h("x", ID.dir)],
    });
    expect(result.get("x")).toBeNull();
  });
});

describe("unitZones (ORG-D5)", () => {
  test("zona tersimpan diwarisi turunan; akar kosong = HO", () => {
    const zones = unitZones([
      { id: "dir", parentId: null, zone: null },
      { id: "ops", parentId: "dir", zone: null },
      { id: "site", parentId: "ops", zone: "SITE" },
      { id: "eng", parentId: "site", zone: null },
      { id: "drl", parentId: "eng", zone: null },
      { id: "fat", parentId: "dir", zone: null },
      { id: "s2", parentId: null, zone: "SITE" },
    ]);
    expect(zones.get("dir")).toBe("HO");
    expect(zones.get("ops")).toBe("HO");
    expect(zones.get("site")).toBe("SITE");
    expect(zones.get("drl")).toBe("SITE");
    expect(zones.get("fat")).toBe("HO");
    expect(zones.get("s2")).toBe("SITE");
  });

  test("anak boleh mengecualikan zona induk (HO di bawah Site & sebaliknya)", () => {
    const zones = unitZones([
      { id: "site", parentId: null, zone: "SITE" },
      { id: "fin", parentId: "site", zone: "HEAD_OFFICE" },
      { id: "fin-sub", parentId: "fin", zone: null },
      { id: "ho", parentId: null, zone: "HEAD_OFFICE" },
      { id: "camp", parentId: "ho", zone: "SITE" },
      { id: "camp-sub", parentId: "camp", zone: null },
    ]);
    expect(zones.get("fin")).toBe("HO");
    expect(zones.get("fin-sub")).toBe("HO");
    expect(zones.get("camp")).toBe("SITE");
    expect(zones.get("camp-sub")).toBe("SITE");
  });

  test("induk tidak dikenal = HO", () => {
    const zones = unitZones([{ id: "x", parentId: "missing", zone: null }]);
    expect(zones.get("x")).toBe("HO");
  });
});
