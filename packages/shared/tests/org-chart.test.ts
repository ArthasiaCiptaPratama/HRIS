import { describe, expect, test } from "bun:test";
import {
  canReportTo,
  orgPostInputSchema,
  resolvePostManagers,
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

describe("resolvePostManagers (D-053)", () => {
  const posts = [
    { id: ID.dir, reportsToId: null },
    { id: ID.ktt, reportsToId: ID.dir },
    { id: ID.wakil, reportsToId: ID.ktt },
    { id: ID.op, reportsToId: ID.wakil },
    { id: ID.asst, reportsToId: ID.op },
    { id: ID.helper, reportsToId: ID.asst },
  ];

  test("atasan = pemegang pos atasan terdekat yang boleh menjadi atasan (akun Manager/SA)", () => {
    const result = resolvePostManagers({
      posts,
      holders: [
        { employeeId: "e-dir", postId: ID.dir },
        { employeeId: "e-ktt", postId: ID.ktt },
        { employeeId: "e-op", postId: ID.op },
        { employeeId: "e-asst", postId: ID.asst },
        { employeeId: "e-helper", postId: ID.helper },
      ],
      eligibleManagers: new Set(["e-dir", "e-ktt", "e-op"]),
    });
    expect(result.get("e-dir")).toBeNull();
    expect(result.get("e-ktt")).toBe("e-dir");
    // Wakil KTT kosong → naik ke KTT.
    expect(result.get("e-op")).toBe("e-ktt");
    expect(result.get("e-asst")).toBe("e-op");
    // Assisten bukan Manager → dilewati, naik ke Operator.
    expect(result.get("e-helper")).toBe("e-op");
  });

  test("pos berisi banyak orang: pemegang pertama yang memenuhi syarat; tidak menunjuk diri sendiri", () => {
    const result = resolvePostManagers({
      posts: [
        { id: ID.dir, reportsToId: null },
        { id: ID.ktt, reportsToId: ID.dir },
      ],
      holders: [
        { employeeId: "a", postId: ID.dir },
        { employeeId: "b", postId: ID.dir },
        { employeeId: "c", postId: ID.ktt },
      ],
      eligibleManagers: new Set(["b"]),
    });
    expect(result.get("c")).toBe("b");
    expect(result.get("b")).toBeNull();
    expect(result.get("a")).toBeNull();
  });

  test("data rusak berbentuk siklus tidak membuat loop tanpa akhir", () => {
    const result = resolvePostManagers({
      posts: [
        { id: ID.dir, reportsToId: ID.ktt },
        { id: ID.ktt, reportsToId: ID.dir },
      ],
      holders: [{ employeeId: "x", postId: ID.dir }],
      eligibleManagers: new Set(),
    });
    expect(result.get("x")).toBeNull();
  });
});
