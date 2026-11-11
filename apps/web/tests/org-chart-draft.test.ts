import { describe, expect, it } from "vitest";
import {
  applyDraft,
  type DraftAction,
  type DraftLookup,
  draftChanges,
  draftReducer,
  EMPTY_DRAFT,
  reorderChanges,
  tryAction,
} from "../src/features/employee/org-chart/edit/draft";
import type { OrgChart, OrgChartPost } from "../src/features/employee/schemas";

// ORG-D2: draf mode edit bagan — undo/redo per aksi, validasi sama dengan server (siklus, PT, slot).

const C = "00000000-0000-4000-8000-0000000000c1";
const post = (id: string, extra: Partial<OrgChartPost> = {}): OrgChartPost => ({
  id,
  positionId: `pos-${id}`,
  positionName: `Jabatan ${id}`,
  level: null,
  departmentId: "unit-1",
  corporate: false,
  reportsToId: null,
  functionalReportsToId: null,
  headcount: 1,
  sortOrder: 0,
  holders: [],
  ...extra,
});

const chart: OrgChart = {
  company: { id: C, code: "ACP", name: "PT ACP" },
  companies: [],
  units: [
    {
      id: "unit-1",
      name: "Site",
      unitType: "DEPARTMENT",
      parentId: null,
      corporate: false,
      zone: null,
    },
    {
      id: "unit-corp",
      name: "Korporat",
      unitType: "DIRECTORATE",
      parentId: null,
      corporate: true,
      zone: null,
    },
  ],
  posts: [
    post("ktt", { level: "L5" }),
    post("se", { reportsToId: "ktt", holders: [{ id: "e1", fullName: "Andi", photoUrl: null }] }),
    post("fm", { reportsToId: "se", sortOrder: 0 }),
    post("fm2", { reportsToId: "se", sortOrder: 10 }),
    post("corp", { departmentId: "unit-corp", corporate: true }),
  ],
  unplacedCount: 0,
  canOpenDetail: true,
  canManage: true,
  canEdit: true,
  canEditCorporate: false,
  revision: 3,
};

const lookup: DraftLookup = {
  positions: new Map([
    ["p-helper", { id: "p-helper", name: "Helper", level: "L1B", departmentId: "unit-1" }],
  ]),
  unitCompany: new Map([
    ["unit-1", C],
    ["unit-corp", null],
  ]),
  unitName: new Map([
    ["unit-1", "Site"],
    ["unit-corp", "Korporat"],
  ]),
};

const act = (changes: DraftAction["changes"], people?: DraftAction["people"]): DraftAction => ({
  label: "uji",
  changes,
  ...(people ? { people } : {}),
});

describe("draftReducer", () => {
  it("undo/redo per aksi; aksi baru menghapus redo", () => {
    const a = act([{ op: "archivePost", postId: "fm2" }]);
    const b = act([{ op: "updatePost", postId: "fm", headcount: 2 }]);
    let state = draftReducer(EMPTY_DRAFT, { type: "push", action: a });
    state = draftReducer(state, { type: "push", action: b });
    state = draftReducer(state, { type: "undo" });
    expect(draftChanges(state)).toEqual(a.changes);
    state = draftReducer(state, { type: "redo" });
    expect(state.actions).toHaveLength(2);
    state = draftReducer(state, { type: "undo" });
    state = draftReducer(state, { type: "push", action: a });
    expect(state.redo).toHaveLength(0);
    expect(draftReducer(state, { type: "reset" })).toEqual(EMPTY_DRAFT);
  });
});

describe("applyDraft", () => {
  it("pos baru + jabatan baru + penempatan pindah dari pos lain", () => {
    const { chart: next, touched } = applyDraft(
      chart,
      [
        act([
          {
            op: "createPosition",
            tempId: "tmp:j1",
            name: "Driller",
            departmentId: "unit-1",
            level: "L1A",
          },
          {
            op: "createPost",
            tempId: "tmp:p1",
            positionId: "tmp:j1",
            reportsToId: "fm",
            functionalReportsToId: null,
            headcount: 2,
            sortOrder: 0,
          },
          { op: "placeEmployee", employeeId: "e1", postId: "tmp:p1" },
        ]),
      ],
      lookup,
    );
    const created = next.posts.find((p) => p.id === "tmp:p1");
    expect(created).toMatchObject({ positionName: "Driller", level: "L1A", reportsToId: "fm" });
    expect(created?.holders.map((h) => h.id)).toEqual(["e1"]);
    expect(next.posts.find((p) => p.id === "se")?.holders).toEqual([]);
    expect(touched.has("tmp:p1")).toBe(true);
  });

  it("menolak siklus, garis tegas ke korporat, slot penuh, arsip pos berisi/berbawahan", () => {
    expect(
      tryAction(chart, [], lookup, act([{ op: "updatePost", postId: "ktt", reportsToId: "fm" }])),
    ).toMatch(/melingkar/);
    expect(
      tryAction(chart, [], lookup, act([{ op: "updatePost", postId: "fm", reportsToId: "corp" }])),
    ).toMatch(/perusahaan yang sama/);
    expect(
      tryAction(
        chart,
        [],
        lookup,
        act([{ op: "updatePost", postId: "fm", functionalReportsToId: "corp" }]),
      ),
    ).toBeNull();
    expect(
      tryAction(
        chart,
        [],
        lookup,
        act(
          [{ op: "placeEmployee", employeeId: "e9", postId: "se" }],
          [{ id: "e9", fullName: "Budi", photoUrl: null }],
        ),
      ),
    ).toMatch(/penuh/);
    expect(tryAction(chart, [], lookup, act([{ op: "archivePost", postId: "se" }]))).toMatch(
      /ditempati/,
    );
    expect(tryAction(chart, [], lookup, act([{ op: "archivePost", postId: "ktt" }]))).toMatch(
      /melapor/,
    );
    expect(tryAction(chart, [], lookup, act([{ op: "archivePost", postId: "fm2" }]))).toBeNull();
    expect(
      tryAction(chart, [], lookup, act([{ op: "updatePost", postId: "se", headcount: 0 }])),
    ).toMatch(/slot/);
  });
});

describe("reorderChanges", () => {
  it("memindah pos ke indeks baru hanya mengirim sortOrder yang berubah", () => {
    const siblings = chart.posts.filter((p) => p.reportsToId === "se");
    expect(reorderChanges(siblings, "fm2", 0)).toEqual([
      { op: "updatePost", postId: "fm2", sortOrder: 0 },
      { op: "updatePost", postId: "fm", sortOrder: 10 },
    ]);
    expect(reorderChanges(siblings, "fm", 0)).toEqual([]);
  });
});

describe("zona HO/Site pos baru di draf (ORG-D5)", () => {
  it("unit jabatan baru membawa leluhurnya sehingga zona Site terbaca", async () => {
    const { unitZones } = await import("@hris/shared");
    const siteLookup: DraftLookup = {
      ...lookup,
      unitCompany: new Map([...lookup.unitCompany, ["u-site", C], ["u-eng", C]]),
      unitName: new Map([
        ...lookup.unitName,
        ["u-site", "Site Operasional (ACP)"],
        ["u-eng", "Engineering (ACP)"],
      ]),
      unitParent: new Map([
        ["u-eng", "u-site"],
        ["u-site", null],
      ]),
      unitZone: new Map([
        ["u-site", "SITE"],
        ["u-eng", null],
      ]),
    };
    const next = applyDraft(
      chart,
      [
        act([
          {
            op: "createPosition",
            tempId: "tmp:j",
            name: "Driller",
            departmentId: "u-eng",
            level: null,
          },
          {
            op: "createPost",
            tempId: "tmp:p",
            positionId: "tmp:j",
            reportsToId: "ktt",
            functionalReportsToId: null,
            headcount: 1,
            sortOrder: 0,
          },
        ]),
      ],
      siteLookup,
    ).chart;
    const zones = unitZones(next.units);
    expect(zones.get("u-eng")).toBe("SITE");
    expect(zones.get("unit-corp")).toBe("HO");
  });
});
