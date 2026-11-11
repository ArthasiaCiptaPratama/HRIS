import {
  canReportTo,
  ORG_POST_HEADCOUNT_MAX,
  type OrgChartChange,
  type PositionLevel,
  wouldCreatePostCycle,
} from "@hris/shared";
import type { OrgChart, OrgChartPost } from "../../schemas";

// ORG-D2: draf mode edit bagan. Setiap aksi pengguna = satu langkah (bisa berisi beberapa operasi,
// mis. "hapus pos + naikkan bawahannya"), sehingga undo/redo bekerja per aksi. Bagan yang tampil
// = bagan server + semua operasi draf (dihitung ulang dari awal; bagan ratusan pos → ringan).
// Validasi di sini memakai aturan shared yang sama dengan server (siklus, PT, slot); server tetap
// memeriksa ulang saat simpan.

export interface DraftPosition {
  id: string;
  name: string;
  level: PositionLevel | null;
  departmentId: string;
}

export interface DraftPerson {
  id: string;
  fullName: string;
  photoUrl: string | null;
}

export interface DraftAction {
  /** Uraian singkat untuk tombol undo/redo, mis. "Tambah pos Foreman". */
  label: string;
  changes: OrgChartChange[];
  /** Data tampil untuk karyawan yang ditempatkan (nama & foto). */
  people?: DraftPerson[];
}

export interface DraftState {
  actions: DraftAction[];
  redo: DraftAction[];
}

export const EMPTY_DRAFT: DraftState = { actions: [], redo: [] };

export type DraftEvent =
  | { type: "push"; action: DraftAction }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

export function draftReducer(state: DraftState, event: DraftEvent): DraftState {
  switch (event.type) {
    case "push":
      return { actions: [...state.actions, event.action], redo: [] };
    case "undo": {
      const last = state.actions.at(-1);
      if (!last) return state;
      return { actions: state.actions.slice(0, -1), redo: [last, ...state.redo] };
    }
    case "redo": {
      const [next, ...rest] = state.redo;
      if (!next) return state;
      return { actions: [...state.actions, next], redo: rest };
    }
    case "reset":
      return EMPTY_DRAFT;
  }
}

export const draftChanges = (state: DraftState): OrgChartChange[] =>
  state.actions.flatMap((action) => action.changes);

export interface DraftLookup {
  /** Jabatan master (aktif) + unitnya; jabatan baru dari draf ditambahkan saat diterapkan. */
  positions: ReadonlyMap<string, DraftPosition>;
  /** Unit → PT (null = fungsi korporat grup). */
  unitCompany: ReadonlyMap<string, string | null>;
  unitName: ReadonlyMap<string, string>;
  /** Induk unit (ORG-D5: zona HO/Site pos baru diwarisi dari leluhur unitnya). */
  unitParent?: ReadonlyMap<string, string | null>;
  /** ORG-D5: zona tersimpan unit (null = ikut induk). */
  unitZone?: ReadonlyMap<string, "HEAD_OFFICE" | "SITE" | null>;
}

export class DraftError extends Error {}

let tempCounter = 0;
/** Id sementara unik untuk pos/jabatan baru (format kontrak `tmp:<slug>`). */
export function newTempId(kind: "post" | "position"): string {
  tempCounter += 1;
  return `tmp:${kind}-${Date.now().toString(36)}-${tempCounter}`;
}

interface Working {
  posts: OrgChartPost[];
  positions: Map<string, DraftPosition>;
  units: OrgChart["units"];
}

function findPost(work: Working, id: string): OrgChartPost {
  const post = work.posts.find((p) => p.id === id);
  if (!post) throw new DraftError("Pos tidak ditemukan di bagan (mungkin sudah dihapus).");
  return post;
}

const companyOf = (chart: OrgChart, post: Pick<OrgChartPost, "corporate">) =>
  post.corporate ? null : chart.company.id;

function assertLinks(chart: OrgChart, work: Working, post: OrgChartPost) {
  if (post.reportsToId && post.reportsToId === post.functionalReportsToId) {
    throw new DraftError("Atasan fungsional tidak boleh sama dengan atasan langsung.");
  }
  for (const [parentId, line] of [
    [post.reportsToId, "solid"],
    [post.functionalReportsToId, "functional"],
  ] as const) {
    if (!parentId) continue;
    if (parentId === post.id) throw new DraftError("Atasan tidak boleh pos ini sendiri.");
    const parent = findPost(work, parentId);
    if (
      !canReportTo(
        { companyId: companyOf(chart, post) },
        { companyId: companyOf(chart, parent) },
        line,
      )
    ) {
      throw new DraftError(
        line === "solid"
          ? "Atasan langsung harus pos di perusahaan yang sama (fungsi korporat hanya lewat garis fungsional)."
          : "Atasan fungsional harus pos di perusahaan yang sama atau fungsi korporat grup.",
      );
    }
  }
}

function applyChange(
  chart: OrgChart,
  work: Working,
  lookup: DraftLookup,
  change: OrgChartChange,
  people: ReadonlyMap<string, DraftPerson>,
) {
  switch (change.op) {
    case "createPosition": {
      work.positions.set(change.tempId, {
        id: change.tempId,
        name: change.name,
        level: change.level ?? null,
        departmentId: change.departmentId,
      });
      return;
    }
    case "createPost": {
      const position = work.positions.get(change.positionId);
      if (!position) throw new DraftError("Jabatan tidak ditemukan.");
      const unitCompany = lookup.unitCompany.get(position.departmentId) ?? null;
      const post: OrgChartPost = {
        id: change.tempId,
        positionId: position.id,
        positionName: position.name,
        level: position.level,
        departmentId: position.departmentId,
        corporate: unitCompany === null,
        reportsToId: change.reportsToId,
        functionalReportsToId: change.functionalReportsToId ?? null,
        headcount: change.headcount,
        sortOrder: change.sortOrder ?? 0,
        holders: [],
      };
      if (!post.corporate && unitCompany !== chart.company.id) {
        throw new DraftError("Jabatan ini milik unit perusahaan lain.");
      }
      work.posts.push(post);
      assertLinks(chart, work, post);
      ensureUnit(work, lookup, position.departmentId, post.corporate);
      return;
    }
    case "updatePost": {
      const post = findPost(work, change.postId);
      const next: OrgChartPost = { ...post };
      if (change.positionId !== undefined && change.positionId !== post.positionId) {
        const position = work.positions.get(change.positionId);
        if (!position) throw new DraftError("Jabatan tidak ditemukan.");
        if (post.holders.length > 0) {
          throw new DraftError(
            "Pos masih ditempati karyawan. Pindahkan pemegangnya dulu sebelum mengganti jabatan.",
          );
        }
        next.positionId = position.id;
        next.positionName = position.name;
        next.level = position.level;
        next.departmentId = position.departmentId;
        next.corporate = (lookup.unitCompany.get(position.departmentId) ?? null) === null;
        ensureUnit(work, lookup, position.departmentId, next.corporate);
      }
      if (change.reportsToId !== undefined) next.reportsToId = change.reportsToId;
      if (change.functionalReportsToId !== undefined) {
        next.functionalReportsToId = change.functionalReportsToId;
      }
      if (change.headcount !== undefined) {
        if (change.headcount < 1 || change.headcount > ORG_POST_HEADCOUNT_MAX) {
          throw new DraftError(`Jumlah slot 1–${ORG_POST_HEADCOUNT_MAX}.`);
        }
        if (change.headcount < post.holders.length) {
          throw new DraftError(
            `Jumlah slot tidak boleh kurang dari pemegang saat ini (${post.holders.length}).`,
          );
        }
        next.headcount = change.headcount;
      }
      if (change.sortOrder !== undefined) next.sortOrder = change.sortOrder;
      if (
        change.reportsToId !== undefined &&
        change.reportsToId &&
        wouldCreatePostCycle(work.posts, post.id, change.reportsToId)
      ) {
        throw new DraftError("Atasan ini membuat struktur melingkar (bawahan menjadi atasan).");
      }
      work.posts = work.posts.map((p) => (p.id === post.id ? next : p));
      assertLinks(chart, work, next);
      return;
    }
    case "archivePost": {
      const post = findPost(work, change.postId);
      if (post.holders.length > 0) {
        throw new DraftError(
          `Pos masih ditempati ${post.holders.length} karyawan. Pindahkan pemegangnya dulu.`,
        );
      }
      const child = work.posts.find(
        (p) => p.reportsToId === post.id || p.functionalReportsToId === post.id,
      );
      if (child) {
        throw new DraftError(
          `Pos "${child.positionName}" masih melapor ke pos ini. Pindahkan bawahannya dulu.`,
        );
      }
      work.posts = work.posts.filter((p) => p.id !== post.id);
      return;
    }
    case "placeEmployee": {
      const person =
        people.get(change.employeeId) ??
        work.posts.flatMap((p) => p.holders).find((h) => h.id === change.employeeId);
      if (!person) throw new DraftError("Karyawan tidak ditemukan.");
      if (change.postId) {
        const target = findPost(work, change.postId);
        const others = target.holders.filter((h) => h.id !== change.employeeId);
        if (others.length >= target.headcount) {
          throw new DraftError(
            `Pos "${target.positionName}" sudah penuh (${target.headcount} slot). Tambah slot dulu.`,
          );
        }
      }
      work.posts = work.posts.map((p) => {
        const holders = p.holders.filter((h) => h.id !== change.employeeId);
        if (p.id === change.postId) {
          holders.push({ id: person.id, fullName: person.fullName, photoUrl: person.photoUrl });
        }
        return holders.length === p.holders.length && p.id !== change.postId
          ? p
          : { ...p, holders };
      });
      return;
    }
  }
}

function ensureUnit(work: Working, lookup: DraftLookup, unitId: string, corporate: boolean) {
  // Unit beserta leluhurnya (supaya zona HO/Site & label unit tetap benar untuk pos baru).
  let cursor: string | null = unitId;
  for (let depth = 0; cursor && depth < 50; depth += 1) {
    const id: string = cursor;
    if (work.units.some((u) => u.id === id)) return;
    const parentId = lookup.unitParent?.get(id) ?? null;
    work.units = [
      ...work.units,
      {
        id,
        name: lookup.unitName.get(id) ?? "Unit",
        unitType: "DEPARTMENT",
        parentId,
        corporate,
        zone: lookup.unitZone?.get(id) ?? null,
      },
    ];
    cursor = parentId;
  }
}

export interface AppliedDraft {
  chart: OrgChart;
  /** Pos yang berubah/baru di draf (untuk penanda visual). */
  touched: Set<string>;
}

/**
 * Terapkan semua aksi draf ke bagan server. Melempar `DraftError` bila ada aksi yang tidak sah —
 * dipakai juga untuk menguji aksi baru sebelum masuk draf (lihat `tryAction`).
 */
export function applyDraft(
  base: OrgChart,
  actions: readonly DraftAction[],
  lookup: DraftLookup,
): AppliedDraft {
  const work: Working = {
    posts: base.posts.map((post) => ({ ...post, holders: [...post.holders] })),
    positions: new Map(lookup.positions),
    units: base.units,
  };
  const touched = new Set<string>();
  for (const action of actions) {
    const people = new Map((action.people ?? []).map((person) => [person.id, person]));
    for (const change of action.changes) {
      applyChange(base, work, lookup, change, people);
      if (change.op === "createPost") touched.add(change.tempId);
      else if (change.op === "updatePost") touched.add(change.postId);
      else if (change.op === "placeEmployee" && change.postId) touched.add(change.postId);
    }
  }
  return { chart: { ...base, posts: work.posts, units: work.units }, touched };
}

/** Uji aksi baru terhadap draf saat ini; mengembalikan pesan error atau null bila sah. */
export function tryAction(
  base: OrgChart,
  actions: readonly DraftAction[],
  lookup: DraftLookup,
  action: DraftAction,
): string | null {
  try {
    applyDraft(base, [...actions, action], lookup);
    return null;
  } catch (error) {
    if (error instanceof DraftError) return error.message;
    throw error;
  }
}

/** Urutan baru saudara (garis tegas) setelah `postId` dipindah ke indeks `index`. */
export function reorderChanges(
  siblings: readonly OrgChartPost[],
  postId: string,
  index: number,
): OrgChartChange[] {
  const ordered = siblings.filter((s) => s.id !== postId);
  const moving = siblings.find((s) => s.id === postId);
  if (!moving) return [];
  ordered.splice(Math.max(0, Math.min(index, ordered.length)), 0, moving);
  return ordered.flatMap((post, i) => {
    const sortOrder = i * 10;
    return post.sortOrder === sortOrder
      ? []
      : [{ op: "updatePost" as const, postId: post.id, sortOrder }];
  });
}
