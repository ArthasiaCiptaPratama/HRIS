// D-051: isi bagan dengan NAMA ASLI — KHUSUS DB LOKAL (PROMPT §3.7: data asli tidak masuk repo, seed,
// atau staging). File sumber disimpan di luar repo (mis. /mnt/winD/WORK/Magang/DATA-ASLI/orgchart-acp.json)
// berformat { "company": "ACP", "posts": { "<kode pos>": ["Nama", ...] } }. Default DRY-RUN.
//
//   bun run org:import-local -- --file=/mnt/winD/WORK/Magang/DATA-ASLI/orgchart-acp.json
//   bun run org:import-local -- --file=... --apply
//
// Efek --apply (DB lokal): karyawan berawalan "ASLI-" dibuat/diperbarui & ditempatkan di posnya; pemegang
// dummy seed ("DMY-") di pos yang sama dihapus. Seed ulang mengembalikan dummy → jalankan script ini lagi.
// Data kepegawaian lain (tanggal masuk, status, lokasi) hanya pengisi; lengkapi lewat aplikasi bila perlu.
import { readFileSync } from "node:fs";
import { resolvePostManagers } from "@hris/shared";
import { z } from "zod";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes("--apply");

// Penjaga: hanya PostgreSQL lokal (Docker). Staging/produksi (Supabase) ditolak tanpa pengecualian.
const url = process.env.DATABASE_URL ?? "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  host = "";
}
if (!["localhost", "127.0.0.1", "::1"].includes(host) || /supabase/i.test(url)) {
  out(`Ditolak: DATABASE_URL bukan DB lokal (host "${host || "?"}"). Script ini khusus lokal.`);
  process.exit(1);
}

const file = arg("file");
if (!file) {
  out("Pakai --file=<path JSON di luar repo>.");
  process.exit(1);
}
if (file.includes("/HRIS/") && !file.includes("DATA-ASLI")) {
  out("Ditolak: file data asli harus di luar repo (mis. folder DATA-ASLI).");
  process.exit(1);
}
const source = z
  .object({
    company: z.string().min(2),
    posts: z.record(z.string(), z.array(z.string().trim().min(1).max(150))),
  })
  .parse(JSON.parse(readFileSync(file, "utf8")));

const prisma = getPrisma();
const company = await prisma.company.findUnique({ where: { code: source.company } });
if (!company) {
  out(`Perusahaan ${source.company} tidak ada di DB lokal. Jalankan seed dulu.`);
  process.exit(1);
}
const posts = await prisma.orgPost.findMany({
  where: { code: { in: Object.keys(source.posts) }, deletedAt: null },
  select: { id: true, code: true, headcount: true, positionId: true, reportsToId: true },
});
const byCode = new Map(posts.map((post) => [post.code as string, post]));
const missing = Object.keys(source.posts).filter((code) => !byCode.has(code));
if (missing.length > 0) {
  out(`Kode pos tidak ditemukan (jalankan seed dulu?): ${missing.join(", ")}`);
  process.exit(1);
}
const over = Object.entries(source.posts).filter(
  ([code, names]) => names.length > (byCode.get(code)?.headcount ?? 0),
);
if (over.length > 0) {
  out(`Nama melebihi slot pos: ${over.map(([code]) => code).join(", ")}`);
  process.exit(1);
}
const statuses = await prisma.employmentStatus.findMany({
  where: { category: "PERMANENT", deletedAt: null },
});
const statusId = statuses[0]?.id;
if (!statusId) {
  out("Status Karyawan Tetap belum ada. Jalankan seed dulu.");
  process.exit(1);
}

const total = Object.values(source.posts).reduce((sum, names) => sum + names.length, 0);
out(
  `${apply ? "APPLY" : "DRY-RUN"} — ${source.company} — ${Object.keys(source.posts).length} pos, ${total} orang`,
);
if (!apply) {
  out("Tidak ada yang diubah. Tambahkan --apply untuk menulis ke DB lokal.");
  await disconnectPrisma();
  process.exit(0);
}

let created = 0;
let removedDummies = 0;
await prisma.$transaction(async (tx) => {
  for (const [code, names] of Object.entries(source.posts)) {
    const post = byCode.get(code);
    if (!post) continue;
    const dummies = await tx.employee.findMany({
      where: { orgPostId: post.id, employeeNumber: { startsWith: "DMY-" } },
      select: { id: true },
    });
    if (dummies.length > 0) {
      const ids = dummies.map((d) => d.id);
      await tx.employee.updateMany({
        where: { managerId: { in: ids } },
        data: { managerId: null },
      });
      await tx.employee.deleteMany({ where: { id: { in: ids } } });
      removedDummies += ids.length;
    }
    for (const [slot, fullName] of names.entries()) {
      const employeeNumber = `ASLI-${code}-${slot + 1}`;
      const data = {
        fullName,
        companyId: company.id,
        positionId: post.positionId,
        orgPostId: post.id,
        employmentStatusId: statusId,
        managerOverride: false,
        isActive: true,
      };
      await tx.employee.upsert({
        where: { employeeNumber },
        update: data,
        create: { employeeNumber, joinDate: new Date("2020-01-01T00:00:00.000Z"), ...data },
      });
      created += 1;
    }
  }
});

// Atasan otomatis (D-053) untuk pemegang yang punya akun Manager/SA (di lokal biasanya belum ada).
const holders = await prisma.employee.findMany({
  where: { isActive: true, orgPostId: { not: null }, managerOverride: false },
  select: { id: true, orgPostId: true },
  orderBy: { employeeNumber: "asc" },
});
const managers = await prisma.account.findMany({
  where: { isActive: true, role: { in: ["MANAGER", "SUPER_ADMIN"] }, employeeId: { not: null } },
  select: { employeeId: true },
});
const allPosts = await prisma.orgPost.findMany({
  where: { deletedAt: null },
  select: { id: true, reportsToId: true },
});
const desired = resolvePostManagers({
  posts: allPosts,
  holders: holders.map((h) => ({ employeeId: h.id, postId: h.orgPostId as string })),
  eligibleManagers: new Set(managers.map((m) => m.employeeId as string)),
});
for (const [id, managerId] of desired) {
  await prisma.employee.update({ where: { id }, data: { managerId } });
}

out(`Selesai: ${created} karyawan ASLI ditempatkan, ${removedDummies} pemegang dummy dihapus.`);
await disconnectPrisma();
