import type { OrgChart, OrgChartPost } from "../schemas";

// D-051: tata letak bagan. Pohon garis tegas (reportsTo) ditata dari atas ke bawah; fungsi korporat grup
// ditata terpisah di panel kanan. Garis putus-putus (fungsional) tidak ikut menentukan posisi supaya
// pohon utama tetap rapi.

export const NODE_WIDTH = 236;
const HEADER_HEIGHT = 58;
const SLOT_HEIGHT = 34;
const FOOTER_HEIGHT = 10;
/** Slot yang ditampilkan per kartu; sisanya diringkas "+n lainnya". */
export const MAX_VISIBLE_SLOTS = 4;

export interface ChartIndex {
  byId: Map<string, OrgChartPost>;
  children: Map<string, OrgChartPost[]>;
  unitName: Map<string, string>;
}

export function indexChart(chart: OrgChart): ChartIndex {
  const byId = new Map(chart.posts.map((post) => [post.id, post]));
  const children = new Map<string, OrgChartPost[]>();
  for (const post of chart.posts) {
    if (!post.reportsToId || !byId.has(post.reportsToId)) continue;
    const list = children.get(post.reportsToId) ?? [];
    list.push(post);
    children.set(post.reportsToId, list);
  }
  for (const list of children.values()) list.sort(bySortOrder);
  return { byId, children, unitName: new Map(chart.units.map((u) => [u.id, u.name])) };
}

function bySortOrder(a: OrgChartPost, b: OrgChartPost) {
  return a.sortOrder - b.sortOrder || a.positionName.localeCompare(b.positionName, "id");
}

/** Jumlah slot yang ditampilkan (pemegang + kosong), dibatasi supaya kartu tidak terlalu tinggi. */
export function slotRows(post: OrgChartPost): number {
  const total = Math.max(post.headcount, post.holders.length);
  return Math.min(total, MAX_VISIBLE_SLOTS) + (total > MAX_VISIBLE_SLOTS ? 1 : 0);
}

export function nodeHeight(post: OrgChartPost): number {
  return HEADER_HEIGHT + slotRows(post) * SLOT_HEIGHT + FOOTER_HEIGHT;
}

/** Semua keturunan (garis tegas) sebuah pos. */
export function descendantsOf(index: ChartIndex, id: string): string[] {
  const result: string[] = [];
  const stack = [...(index.children.get(id) ?? [])];
  while (stack.length > 0) {
    const post = stack.pop() as OrgChartPost;
    result.push(post.id);
    stack.push(...(index.children.get(post.id) ?? []));
  }
  return result;
}

/** Leluhur (garis tegas) sebuah pos, dari atasan langsung ke puncak. */
export function ancestorsOf(index: ChartIndex, id: string): string[] {
  const result: string[] = [];
  let cursor = index.byId.get(id)?.reportsToId ?? null;
  for (let depth = 0; cursor && depth < 200; depth += 1) {
    result.push(cursor);
    cursor = index.byId.get(cursor)?.reportsToId ?? null;
  }
  return result;
}

/** Pos yang tersembunyi karena salah satu leluhurnya dilipat. */
export function hiddenPosts(index: ChartIndex, collapsed: ReadonlySet<string>): Set<string> {
  const hidden = new Set<string>();
  for (const id of collapsed) for (const child of descendantsOf(index, id)) hidden.add(child);
  return hidden;
}

/** Lipat semua pos di bawah kedalaman tertentu (0 = puncak). */
export function collapseBelowDepth(chart: OrgChart, index: ChartIndex, depth: number): Set<string> {
  const collapsed = new Set<string>();
  for (const post of chart.posts) {
    if (post.corporate || !index.children.has(post.id)) continue;
    if (ancestorsOf(index, post.id).length >= depth) collapsed.add(post.id);
  }
  return collapsed;
}

export interface LaidOutNode {
  post: OrgChartPost;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLayout {
  nodes: LaidOutNode[];
  /** Kotak panel fungsi korporat (koordinat kanvas) bila ada pos korporat. */
  corporate: { x: number; y: number; width: number; height: number } | null;
}

const SIBLING_GAP = 28;
const ROOT_GAP = 72;
const LEVEL_GAP = 64;
const CORPORATE_PADDING = { top: 56, side: 24, bottom: 24 };
const CORPORATE_GAP = 140;

/**
 * Tata letak pohon rapi tanpa pustaka: anak berjajar kiri → kanan sesuai sortOrder, induk di tengah
 * atas anak-anaknya, setiap tingkat sejajar (tinggi tingkat = kartu tertinggi). Garis tegas selalu
 * pohon (siklus ditolak API), jadi cukup satu lintasan rekursif — ringan dan deterministik.
 */
function layoutTree(posts: OrgChartPost[], index: ChartIndex): LaidOutNode[] {
  if (posts.length === 0) return [];
  const visible = new Set(posts.map((post) => post.id));
  const kids = (id: string) => (index.children.get(id) ?? []).filter((c) => visible.has(c.id));
  const roots = posts
    .filter((post) => !post.reportsToId || !visible.has(post.reportsToId))
    .sort(bySortOrder);

  // Kedalaman & tinggi baris per tingkat.
  const depthOf = new Map<string, number>();
  const rowHeight: number[] = [];
  const walk = (post: OrgChartPost, depth: number) => {
    if (depthOf.has(post.id)) return;
    depthOf.set(post.id, depth);
    rowHeight[depth] = Math.max(rowHeight[depth] ?? 0, nodeHeight(post));
    for (const child of kids(post.id)) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  const rowTop: number[] = [];
  for (let depth = 0, top = 0; depth < rowHeight.length; depth += 1) {
    rowTop[depth] = top;
    top += (rowHeight[depth] ?? 0) + LEVEL_GAP;
  }

  // Lebar subpohon (pasca-urut), lalu letakkan (pra-urut).
  const span = new Map<string, number>();
  const measure = (post: OrgChartPost): number => {
    const children = kids(post.id);
    const width =
      children.length === 0
        ? NODE_WIDTH
        : Math.max(
            NODE_WIDTH,
            children.reduce((sum, child) => sum + measure(child), 0) +
              SIBLING_GAP * (children.length - 1),
          );
    span.set(post.id, width);
    return width;
  };
  const result: LaidOutNode[] = [];
  const place = (post: OrgChartPost, left: number) => {
    const width = span.get(post.id) ?? NODE_WIDTH;
    const depth = depthOf.get(post.id) ?? 0;
    result.push({
      post,
      x: left + (width - NODE_WIDTH) / 2,
      y: rowTop[depth] ?? 0,
      width: NODE_WIDTH,
      height: nodeHeight(post),
    });
    const children = kids(post.id);
    const used =
      children.reduce((sum, child) => sum + (span.get(child.id) ?? NODE_WIDTH), 0) +
      SIBLING_GAP * Math.max(children.length - 1, 0);
    let cursor = left + (width - used) / 2;
    for (const child of children) {
      place(child, cursor);
      cursor += (span.get(child.id) ?? NODE_WIDTH) + SIBLING_GAP;
    }
  };
  let left = 0;
  for (const root of roots) {
    measure(root);
    place(root, left);
    left += (span.get(root.id) ?? NODE_WIDTH) + ROOT_GAP;
  }
  return result;
}

/** Tata letak lengkap: pohon PT + panel korporat di kanan, sejajar atas. */
export function layoutChart(
  chart: OrgChart,
  index: ChartIndex,
  collapsed: ReadonlySet<string>,
): ChartLayout {
  const hidden = hiddenPosts(index, collapsed);
  const mainNodes = layoutTree(
    chart.posts.filter((post) => !post.corporate && !hidden.has(post.id)),
    index,
  );
  // Panel korporat: tiap cabang (pos tanpa atasan) ditumpuk vertikal seperti di dokumen kantor,
  // supaya panel ramping dan bagan utama tetap besar saat dipaskan ke layar.
  const corporatePosts = chart.posts.filter((post) => post.corporate && !hidden.has(post.id));
  const corporateIds = new Set(corporatePosts.map((post) => post.id));
  const corporateNodes: LaidOutNode[] = [];
  let stackTop = 0;
  for (const root of corporatePosts
    .filter((post) => !post.reportsToId || !corporateIds.has(post.reportsToId))
    .sort(bySortOrder)) {
    const branch = new Set([root.id, ...descendantsOf(index, root.id)]);
    const nodes = layoutTree(
      corporatePosts.filter((post) => branch.has(post.id)),
      index,
    );
    for (const node of nodes) corporateNodes.push({ ...node, y: node.y + stackTop });
    stackTop += Math.max(...nodes.map((node) => node.y + node.height)) + SIBLING_GAP;
  }
  if (corporateNodes.length === 0) return { nodes: mainNodes, corporate: null };

  const right = Math.max(0, ...mainNodes.map((node) => node.x + node.width));
  const offsetX = (mainNodes.length > 0 ? right + CORPORATE_GAP : 0) + CORPORATE_PADDING.side;
  const offsetY = CORPORATE_PADDING.top;
  const shifted = corporateNodes.map((node) => ({
    ...node,
    x: node.x + offsetX,
    y: node.y + offsetY,
  }));
  const width =
    Math.max(...corporateNodes.map((node) => node.x + node.width)) + CORPORATE_PADDING.side * 2;
  const height =
    Math.max(...corporateNodes.map((node) => node.y + node.height)) +
    CORPORATE_PADDING.top +
    CORPORATE_PADDING.bottom;
  return {
    nodes: [...mainNodes, ...shifted],
    corporate: { x: offsetX - CORPORATE_PADDING.side, y: 0, width, height },
  };
}

export interface SearchHit {
  postId: string;
  label: string;
  detail: string;
  personId: string | null;
}

const fold = (text: string) => text.toLocaleLowerCase("id-ID").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Cari orang (nama) atau pos (nama jabatan); maksimal 12 hasil, orang lebih dulu. */
export function searchChart(chart: OrgChart, index: ChartIndex, query: string): SearchHit[] {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const people: SearchHit[] = [];
  const posts: SearchHit[] = [];
  for (const post of chart.posts) {
    const unit = index.unitName.get(post.departmentId) ?? "";
    for (const holder of post.holders) {
      if (fold(holder.fullName).includes(needle)) {
        people.push({
          postId: post.id,
          label: holder.fullName,
          detail: `${post.positionName} · ${unit}`,
          personId: holder.id,
        });
      }
    }
    if (fold(post.positionName).includes(needle)) {
      const vacant = Math.max(post.headcount - post.holders.length, 0);
      posts.push({
        postId: post.id,
        label: post.positionName,
        detail: `${unit}${vacant > 0 ? ` · ${vacant} kosong` : ""}`,
        personId: null,
      });
    }
  }
  return [...people, ...posts].slice(0, 12);
}
