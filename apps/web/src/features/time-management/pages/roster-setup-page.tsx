import {
  DEFAULT_TIME_SETTINGS,
  expandRosterShorthand,
  OFF_CODE,
  patternRestWarnings,
  ROSTER_TEMPLATE_LABELS,
  ROSTER_TEMPLATES,
  type RosterTemplate,
} from "@hris/shared";
import {
  Archive,
  CalendarCog,
  LayoutTemplate,
  Pencil,
  Plus,
  Search,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmployees, useMasterData } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import {
  useCrews,
  usePatterns,
  useRosterMaster,
  useSetCrewMembers,
  useShifts,
  useTimeSettings,
} from "../api";
import { hhmm, parseHhmm, todayIn, workDateLabel } from "../components/display";
import { PatternChips } from "../components/pattern-chips";
import { TemplateTab } from "../components/roster-template-tab";
import { useApplyRosterTemplate } from "../overtime-api";
import type { Crew, Pattern, Shift } from "../schemas";
import { useRosterCompany } from "./roster-page";

// D-069: master roster per PT — shift (jendela absen per shift), pola siklus, crew + anggota.
// Mengubah pola/crew membangkitkan ulang hari roster ke depan (hari manual/import/perubahan tetap).

export function RosterSetupPage() {
  const { companies, companyId, setCompanyId } = useRosterCompany();
  return (
    <div>
      <PageHeader
        title="Shift, Pola & Crew"
        description="Atur jam shift beserta jendela absennya, pola siklus roster (mis. 10 kerja / 4 libur), dan crew yang mengikuti pola."
        actions={
          companies.length > 1 ? (
            <FormSelect
              aria-label="Perusahaan"
              className="h-9 w-56"
              value={companyId}
              onChange={setCompanyId}
              placeholder="Pilih perusahaan"
              options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
            />
          ) : null
        }
      />
      {!companyId ? (
        <EmptyState icon={CalendarCog} title="Belum ada perusahaan dalam cakupan akun ini" />
      ) : (
        <Tabs defaultValue="template">
          <TabsList>
            <TabsTrigger value="template">Template</TabsTrigger>
            <TabsTrigger value="shift">Shift</TabsTrigger>
            <TabsTrigger value="pattern">Pola roster</TabsTrigger>
            <TabsTrigger value="crew">Crew</TabsTrigger>
          </TabsList>
          <TabsContent value="template" className="mt-4">
            <TemplateTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="shift" className="mt-4">
            <ShiftTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="pattern" className="mt-4">
            <PatternTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="crew" className="mt-4">
            <CrewTab companyId={companyId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

// ── Shift ──────────────────────────────────────────────────────────────────────

function ShiftTab({ companyId }: { companyId: string }) {
  const shifts = useShifts(companyId);
  const { archive } = useRosterMaster("shifts");
  const [editing, setEditing] = useState<Shift | "new" | null>(null);
  const [template, setTemplate] = useState(false);
  const list = (shifts.data ?? []).filter((s) => !s.archived);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setTemplate(true)}>
          <LayoutTemplate /> Pakai template
        </Button>
        <Button variant="brand" onClick={() => setEditing("new")}>
          <Plus /> Tambah shift
        </Button>
      </div>
      {shifts.isPending ? (
        <Skeleton className="h-40" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={CalendarCog}
          title="Belum ada shift"
          description="Contoh: D (Day) 07:00–19:00, N (Night) 19:00–07:00."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <div key={s.id} className="bg-card rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className="font-mono text-lg font-semibold"
                    style={s.color ? { color: s.color } : undefined}
                  >
                    {s.code}
                  </p>
                  <p className="text-sm">{s.name}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Ubah ${s.code}`}
                    onClick={() => setEditing(s)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Arsipkan ${s.code}`}
                    onClick={() =>
                      archive.mutate(s.id, {
                        onSuccess: () => toast.success(`Shift ${s.code} diarsipkan.`),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                  >
                    <Archive />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm tabular-nums">
                {hhmm(s.startMinute)}–{hhmm(s.endMinute)}
                {s.startsNextDay ? (
                  <Badge variant="muted" className="ml-2">
                    malam setelah tanggal roster
                  </Badge>
                ) : s.crossesMidnight ? (
                  <Badge variant="muted" className="ml-2">
                    lintas tengah malam
                  </Badge>
                ) : null}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Absen masuk dibuka {s.checkInOpenMin} mnt sebelum · telat &gt; {s.lateToleranceMin}{" "}
                mnt · absen pulang ditutup {s.checkOutCloseMin} mnt setelah selesai
              </p>
              {s.breakMin || s.regularOvertimeMin ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {s.breakMin
                    ? `Istirahat ${s.breakMin} mnt${s.breakPaid ? " (dibayar)" : ""}`
                    : "Tanpa jatah istirahat"}
                  {s.breakStartMinute != null && s.breakEndMinute != null
                    ? ` · mulai istirahat ${hhmm(s.breakStartMinute)}–${hhmm(s.breakEndMinute)}`
                    : ""}
                  {s.regularOvertimeMin
                    ? ` · lembur rutin ${s.regularOvertimeMin} mnt di akhir shift`
                    : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {template ? (
        <TemplateDialog companyId={companyId} onClose={() => setTemplate(false)} />
      ) : null}
      {editing ? (
        <ShiftDialog
          companyId={companyId}
          shift={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/** TM-D8: pasang template JT — 3 shift × 8 jam (7j + 1j lembur rutin), pola 6+1 rotasi mingguan. */
/** TM-D14: jam mulai sebelum 06.00 = shift dini hari (pertanyaan tanggal nyata ditampilkan). */
const DAWN_END_MIN = 6 * 60;

const TEMPLATE_INFO: Record<
  RosterTemplate,
  { description: string; crewHint: string; warning?: string; crewWarning?: string }
> = {
  JT: {
    description:
      "Shift JTP 07–15, JTS 15–23, JTM 23–07 (7 jam normal + 1 jam lembur rutin, istirahat 60 mnt dibayar), pola 6 kerja + 1 OFF dengan rotasi Pagi → Sore → Malam tiap minggu (siklus 21 hari). Hari ke-6 (5 jam) diatur sendiri di Roster Bulanan.",
    crewHint: "Diisi = dibuat JT Crew A/B/C; pada tanggal mulai A Pagi, B Sore, C Malam.",
    crewWarning:
      "Dengan 3 crew, hari OFF ketiganya jatuh di tanggal yang sama (tiap hari ke-7), sehingga hari itu tidak ada yang berjaga. Atur crew pengganti atau ubah sel roster hari OFF bila operasi harus 24 jam penuh.",
  },
  ROT_13_1: {
    description:
      "Shift R13 07–15 (7 jam normal + 1 jam lembur rutin, istirahat 60 mnt dibayar), pola 13 hari kerja + 1 OFF (siklus 14 hari).",
    crewHint: "Diisi = dibuat 1 crew (13+1 Crew A) yang mulai siklus pada tanggal mulai.",
    warning:
      "13 hari × 7 jam normal per 14 hari ≈ 45,5 jam/minggu, di atas 40 jam/minggu. Pastikan sesuai perjanjian kerja (lembur/waktu kerja khusus sektor).",
  },
  SHIFT_3X8: {
    description:
      "Shift S1 08–16, S2 16–24, S3 24–08 (S3 dijalani malam setelah tanggal roster, tetap tercatat di tanggal roster), istirahat 60 mnt dibayar. Pola 2 hari S1 → 2 hari S2 → 2 hari S3 → 2 OFF (siklus 8 hari).",
    crewHint:
      "Diisi = dibuat 4 crew (A–D) bergeser 2 hari, sehingga setiap shift selalu dijaga satu crew.",
  },
  WEEK_5_2: {
    description:
      "Shift K52 08–17 (8 jam kerja + 1 jam istirahat tidak dibayar, tanpa lembur rutin), pola Senin–Jumat kerja, Sabtu–Minggu OFF.",
    crewHint: "Diisi = dibuat 1 crew (5+2 Kantor); siklus otomatis dimulai hari Senin.",
  },
};

/** TM-D8: pasang template roster (JT, 13+1, 5+2) — shift, pola, dan crew opsional sekaligus. */
function TemplateDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const master = useMasterData();
  const apply = useApplyRosterTemplate();
  const [template, setTemplate] = useState<RosterTemplate>("JT");
  const [workLocationId, setWorkLocationId] = useState("");
  const [start, setStart] = useState(todayIn("Asia/Jakarta"));
  const info = TEMPLATE_INFO[template];
  const submit = async () => {
    try {
      const out = await apply.mutateAsync({
        template,
        companyId,
        workLocationId: workLocationId || null,
        cycleStartDate: start,
      });
      toast.success(
        `Template ${template === "JT" ? "JT" : ROSTER_TEMPLATE_LABELS[template].split(" — ")[0]} terpasang: shift ${out.shifts
          .map((s) => s.code)
          .join(", ")}${out.crews.length ? ` + ${out.crews.length} crew` : ""}.`,
      );
      // TM-D13 Fase D: jeda antarshift di pola yang kurang dari pengaturan.
      for (const warning of out.restWarnings ?? []) toast.warning(warning);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pakai template roster</DialogTitle>
          <DialogDescription>{info.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Template">
            <FormSelect
              aria-label="Template roster"
              placeholder="Pilih template"
              value={template}
              onChange={(v) => setTemplate(v as RosterTemplate)}
              options={ROSTER_TEMPLATES.map((t) => ({
                value: t,
                label: ROSTER_TEMPLATE_LABELS[t],
              }))}
            />
          </Field>
          <Field label="Lokasi kerja crew (opsional)" hint={info.crewHint}>
            <FormSelect
              aria-label="Lokasi kerja"
              value={workLocationId}
              onChange={setWorkLocationId}
              placeholder="Tanpa crew"
              options={[
                { value: "", label: "Tanpa crew (shift & pola saja)" },
                ...(master.data?.workLocations ?? []).map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          </Field>
          <Field label="Tanggal mulai siklus">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          {info.warning ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {info.warning}
            </p>
          ) : null}
          {workLocationId && info.crewWarning ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Catatan: {info.crewWarning}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={apply.isPending || !start}
            onClick={() => void submit()}
          >
            Pasang template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftDialog({
  companyId,
  shift,
  onClose,
}: {
  companyId: string;
  shift: Shift | null;
  onClose: () => void;
}) {
  const { save } = useRosterMaster("shifts");
  const [form, setForm] = useState({
    code: shift?.code ?? "",
    name: shift?.name ?? "",
    start: shift ? hhmm(shift.startMinute) : "07:00",
    end: shift ? hhmm(shift.endMinute) : "19:00",
    checkInOpenMin: shift?.checkInOpenMin ?? 60,
    lateToleranceMin: shift?.lateToleranceMin ?? 15,
    earlyLeaveToleranceMin: shift?.earlyLeaveToleranceMin ?? 15,
    checkOutCloseMin: shift?.checkOutCloseMin ?? 30,
    breakMin: shift?.breakMin ?? 0,
    breakPaid: shift?.breakPaid ?? false,
    startsNextDay: shift?.startsNextDay ?? false,
    breakStart: shift?.breakStartMinute != null ? hhmm(shift.breakStartMinute) : "",
    breakEnd: shift?.breakEndMinute != null ? hhmm(shift.breakEndMinute) : "",
    regularOvertimeMin: shift?.regularOvertimeMin ?? 0,
    color: shift?.color ?? "#0f766e",
  });
  // TM-D12: jatah istirahat otomatis dari jam istirahat (masih bisa diubah).
  const setBreakTime = (k: "breakStart" | "breakEnd", v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      const a = parseHhmm(next.breakStart);
      const b = parseHhmm(next.breakEnd);
      return a !== null && b !== null ? { ...next, breakMin: (b - a + 1440) % 1440 } : next;
    });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  // TM-D14: tanggal nyata shift dini hari ditanyakan dengan contoh; shift lain tidak perlu memilih.
  const startParsed = parseHhmm(form.start);
  const dawn = startParsed !== null && startParsed < DAWN_END_MIN;
  const submit = async () => {
    const startMinute = parseHhmm(form.start);
    const endMinute = parseHhmm(form.end);
    if (startMinute === null || endMinute === null) {
      toast.error("Jam mulai/selesai tidak valid.");
      return;
    }
    const breakStartMinute = form.breakStart ? parseHhmm(form.breakStart) : null;
    const breakEndMinute = form.breakEnd ? parseHhmm(form.breakEnd) : null;
    if ((breakStartMinute === null) !== (breakEndMinute === null)) {
      toast.error("Isi jam mulai dan jam selesai istirahat, atau kosongkan keduanya.");
      return;
    }
    try {
      await save.mutateAsync({
        id: shift?.id,
        body: {
          companyId,
          code: form.code,
          name: form.name,
          startMinute,
          endMinute,
          checkInOpenMin: Number(form.checkInOpenMin),
          lateToleranceMin: Number(form.lateToleranceMin),
          earlyLeaveToleranceMin: Number(form.earlyLeaveToleranceMin),
          checkOutCloseMin: Number(form.checkOutCloseMin),
          breakMin: Number(form.breakMin),
          breakPaid: form.breakPaid,
          // TM-D14: pilihan tanggal hanya berlaku untuk shift dini hari (00.00–05.59).
          startsNextDay: dawn && form.startsNextDay,
          breakStartMinute,
          breakEndMinute,
          regularOvertimeMin: Number(form.regularOvertimeMin),
          color: form.color || null,
        },
      });
      toast.success(shift ? "Shift diperbarui." : "Shift ditambahkan.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const num = (
    k:
      | "checkInOpenMin"
      | "lateToleranceMin"
      | "earlyLeaveToleranceMin"
      | "checkOutCloseMin"
      | "breakMin"
      | "regularOvertimeMin",
  ) => (
    <Input type="number" min={0} value={form[k]} onChange={(e) => set(k, Number(e.target.value))} />
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{shift ? `Ubah shift ${shift.code}` : "Tambah shift"}</DialogTitle>
          <DialogDescription>
            Jam berlaku di zona waktu pengaturan Time Management (bawaan WITA).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kode" hint="1–10 huruf/angka, mis. D, N, NS">
            <Input
              value={form.code}
              maxLength={10}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Nama">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Mulai">
            <Input type="time" value={form.start} onChange={(e) => set("start", e.target.value)} />
          </Field>
          <Field label="Selesai" hint="Lebih kecil dari mulai = lintas tengah malam">
            <Input type="time" value={form.end} onChange={(e) => set("end", e.target.value)} />
          </Field>
          <Field label="Absen masuk dibuka (mnt sebelum)">{num("checkInOpenMin")}</Field>
          <Field label="Toleransi telat (mnt)">{num("lateToleranceMin")}</Field>
          <Field
            label="Toleransi pulang cepat (mnt)"
            hint="Tidak dipakai untuk Clock Out; batasnya di Pengaturan TM (TM-D12)."
          >
            {num("earlyLeaveToleranceMin")}
          </Field>
          <Field label="Mulai istirahat dari" hint="Kosong = istirahat bebas kapan saja.">
            <Input
              type="time"
              value={form.breakStart}
              onChange={(e) => setBreakTime("breakStart", e.target.value)}
            />
          </Field>
          <Field label="Mulai istirahat sampai" hint="Selesai istirahat tetap bebas.">
            <Input
              type="time"
              value={form.breakEnd}
              onChange={(e) => setBreakTime("breakEnd", e.target.value)}
            />
          </Field>
          <Field label="Absen pulang ditutup (mnt setelah)">{num("checkOutCloseMin")}</Field>
          <Field
            label="Jatah istirahat (mnt)"
            hint="Istirahat lebih dari ini mengurangi lembur hari itu."
          >
            {num("breakMin")}
          </Field>
          <Field
            label="Lembur rutin (mnt di akhir shift)"
            hint="Mis. JT: 60 = jam terakhir shift adalah lembur rutin."
          >
            {num("regularOvertimeMin")}
          </Field>
          {dawn ? (
            <fieldset className="bg-muted/40 col-span-2 space-y-2 rounded-lg border p-3 text-sm">
              <legend className="px-1 font-medium">Shift ini dimulai dini hari</legend>
              <p className="text-muted-foreground">Kalau di roster ditulis tanggal 17, artinya:</p>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="starts-next-day"
                  className="size-4"
                  checked={!form.startsNextDay}
                  onChange={() => set("startsNextDay", false)}
                />
                <span>
                  17, pukul {form.start} <span className="text-muted-foreground">(bawaan)</span>
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="starts-next-day"
                  className="size-4"
                  checked={form.startsNextDay}
                  onChange={() => set("startsNextDay", true)}
                />
                <span>
                  18, pukul {form.start}{" "}
                  <span className="text-muted-foreground">(malam setelah tanggal roster)</span>
                </span>
              </label>
            </fieldset>
          ) : null}
          <label className="col-span-2 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={form.breakPaid}
              onChange={(e) => set("breakPaid", e.target.checked)}
            />
            <span>
              Istirahat dibayar (termasuk jam kerja, mis. operasi nonstop JT). Tidak dicentang =
              istirahat dipotong dari jam kerja.
            </span>
          </label>
          <Field label="Warna">
            <Input
              type="color"
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              className="h-9 p-1"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="brand" disabled={save.isPending} onClick={() => void submit()}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Pola ───────────────────────────────────────────────────────────────────────

function PatternTab({ companyId }: { companyId: string }) {
  const patterns = usePatterns(companyId);
  const { archive } = useRosterMaster("roster-patterns");
  const [editing, setEditing] = useState<Pattern | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="brand" onClick={() => setEditing("new")}>
          <Plus /> Tambah pola
        </Button>
      </div>
      {patterns.isPending ? (
        <Skeleton className="h-40" />
      ) : (patterns.data ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarCog}
          title="Belum ada pola roster"
          description="Contoh: 10/4 (10 hari kerja, 4 hari libur)."
        />
      ) : (
        <div className="space-y-2">
          {(patterns.data ?? []).map((p) => (
            <div
              key={p.id}
              className="bg-card flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-muted-foreground text-xs">
                  Siklus {p.cycleLength} hari · {p.workDays} kerja · {p.cycleLength - p.workDays}{" "}
                  libur · dipakai {p.crewCount} crew
                </p>
                <PatternChips steps={p.steps} className="mt-2" />
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  <Pencil /> Ubah
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    archive.mutate(p.id, {
                      onSuccess: () => toast.success("Pola diarsipkan."),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <Archive /> Arsipkan
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <PatternDialog
          companyId={companyId}
          pattern={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function PatternDialog({
  companyId,
  pattern,
  onClose,
}: {
  companyId: string;
  pattern: Pattern | null;
  onClose: () => void;
}) {
  const { save } = useRosterMaster("roster-patterns");
  const shifts = useShifts(companyId);
  const [name, setName] = useState(pattern?.name ?? "");
  const [stepsText, setStepsText] = useState(pattern?.steps.join(" ") ?? "");
  const [work, setWork] = useState(10);
  const [off, setOff] = useState(4);
  const [workCode, setWorkCode] = useState("");
  const steps = stepsText
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  const codes = (shifts.data ?? []).filter((s) => !s.archived).map((s) => s.code);
  const unknown = [...new Set(steps.filter((s) => s !== OFF_CODE && !codes.includes(s)))];
  // TM-D13 Fase D: pergantian shift berurutan dengan jeda < pengaturan (hanya peringatan).
  const minRestHours = useTimeSettings().data?.minRestHours ?? DEFAULT_TIME_SETTINGS.minRestHours;
  const restWarnings = patternRestWarnings(
    steps,
    (shifts.data ?? []).filter((s) => !s.archived),
    minRestHours,
  );
  const submit = async () => {
    try {
      await save.mutateAsync({ id: pattern?.id, body: { companyId, name, steps } });
      toast.success(
        pattern ? "Pola diperbarui; roster crew dibangkitkan ulang." : "Pola ditambahkan.",
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pattern ? "Ubah pola" : "Tambah pola"}</DialogTitle>
          <DialogDescription>
            Urutan kode per hari dalam satu siklus, dipisah spasi. Gunakan {OFF_CODE} untuk hari
            libur.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nama">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="10/4 Day" />
          </Field>
          <div className="bg-muted/50 flex flex-wrap items-end gap-2 rounded-lg p-3">
            <Field label="Kerja">
              <Input
                type="number"
                min={1}
                className="w-20"
                value={work}
                onChange={(e) => setWork(Number(e.target.value))}
              />
            </Field>
            <Field label="Libur">
              <Input
                type="number"
                min={0}
                className="w-20"
                value={off}
                onChange={(e) => setOff(Number(e.target.value))}
              />
            </Field>
            <Field label="Kode kerja">
              <FormSelect
                className="h-9 w-28"
                value={workCode}
                onChange={setWorkCode}
                placeholder="Kode"
                options={codes.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Button
              variant="outline"
              disabled={!workCode}
              onClick={() => setStepsText(expandRosterShorthand(work, off, workCode).join(" "))}
            >
              Isi otomatis
            </Button>
          </div>
          <Field label="Langkah pola" hint={`${steps.length} hari per siklus`}>
            <Input
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder="D D D D D N N N N N OFF OFF OFF OFF"
            />
          </Field>
          <PatternChips steps={steps} />
          {unknown.length > 0 ? (
            <p className="text-destructive text-xs">
              Kode belum ada di master shift: {unknown.join(", ")}
            </p>
          ) : null}
          {restWarnings.length > 0 ? (
            <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium">Jeda antarshift kurang dari {minRestHours} jam:</p>
              <ul className="mt-1 list-disc pl-4">
                {restWarnings.map((w) => (
                  <li key={w.index}>
                    Hari {w.index + 1} → {w.index + 2}: {w.from} lalu {w.to} ({w.restHours} jam)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={save.isPending || steps.length === 0 || unknown.length > 0}
            onClick={() => void submit()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Crew ───────────────────────────────────────────────────────────────────────

function CrewTab({ companyId }: { companyId: string }) {
  const crews = useCrews(companyId);
  const { archive } = useRosterMaster("crews");
  const [editing, setEditing] = useState<Crew | "new" | null>(null);
  const [members, setMembers] = useState<Crew | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="brand" onClick={() => setEditing("new")}>
          <Plus /> Tambah crew
        </Button>
      </div>
      {crews.isPending ? (
        <Skeleton className="h-40" />
      ) : (crews.data ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada crew"
          description="Crew = kelompok karyawan yang mengikuti pola yang sama (mis. Crew A/B/C/D)."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(crews.data ?? []).map((c) => (
            <div key={c.id} className="bg-card rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {c.pattern.name} · mulai siklus {workDateLabel(c.cycleStartDate)} ·{" "}
                    {c.workLocation?.name ?? "—"}
                  </p>
                </div>
                <Badge variant="muted">{c.members.length} anggota</Badge>
              </div>
              <PatternChips steps={c.pattern.steps} className="mt-2" />
              <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
                {c.members.map((m) => m.fullName).join(", ") || "Belum ada anggota."}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setMembers(c)}>
                  <Users /> Anggota
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                  <Pencil /> Ubah
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    archive.mutate(c.id, {
                      onSuccess: () => toast.success("Crew diarsipkan."),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <Archive /> Arsipkan
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <CrewDialog
          companyId={companyId}
          crew={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {members ? <MembersDialog crew={members} onClose={() => setMembers(null)} /> : null}
    </div>
  );
}

function CrewDialog({
  companyId,
  crew,
  onClose,
}: {
  companyId: string;
  crew: Crew | null;
  onClose: () => void;
}) {
  const { save } = useRosterMaster("crews");
  const patterns = usePatterns(companyId);
  const master = useMasterData();
  const [form, setForm] = useState({
    name: crew?.name ?? "",
    patternId: crew?.pattern.id ?? "",
    workLocationId: crew?.workLocation?.id ?? "",
    cycleStartDate: crew?.cycleStartDate ?? todayIn(),
  });
  const submit = async () => {
    try {
      await save.mutateAsync({ id: crew?.id, body: { companyId, ...form } });
      toast.success(crew ? "Crew diperbarui; roster dibangkitkan ulang." : "Crew ditambahkan.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{crew ? `Ubah ${crew.name}` : "Tambah crew"}</DialogTitle>
          <DialogDescription>
            Tanggal mulai siklus = hari pertama langkah pola. Geser tanggal ini untuk membedakan
            crew A/B/C/D.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nama crew">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Crew A"
            />
          </Field>
          <Field label="Pola roster">
            <FormSelect
              value={form.patternId}
              onChange={(v) => setForm({ ...form, patternId: v })}
              placeholder="Pilih pola"
              options={(patterns.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Lokasi kerja (acuan geofence)">
            <FormSelect
              value={form.workLocationId}
              onChange={(v) => setForm({ ...form, workLocationId: v })}
              placeholder="Pilih lokasi"
              options={(master.data?.workLocations ?? []).map((l) => ({
                value: l.id,
                label: l.name,
              }))}
            />
          </Field>
          <Field label="Mulai siklus">
            <Input
              type="date"
              value={form.cycleStartDate}
              onChange={(e) => setForm({ ...form, cycleStartDate: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={save.isPending || !form.name || !form.patternId || !form.workLocationId}
            onClick={() => void submit()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ crew, onClose }: { crew: Crew; onClose: () => void }) {
  const setMembers = useSetCrewMembers();
  const [selected, setSelected] = useState(() =>
    crew.members.map((m) => ({
      id: m.employeeId,
      fullName: m.fullName,
      employeeNumber: m.employeeNumber,
    })),
  );
  const [effectiveDate, setEffectiveDate] = useState(todayIn());
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const results = useEmployees(
    {
      page: 1,
      pageSize: 10,
      active: true,
      q: q || undefined,
      companyId: crew.companyId,
      sort: "fullName:asc",
    },
    q.length >= 2,
  );
  const has = (id: string) => selected.some((s) => s.id === id);
  const submit = async () => {
    try {
      const result = await setMembers.mutateAsync({
        crewId: crew.id,
        employeeIds: selected.map((s) => s.id),
        effectiveDate,
      });
      toast.success(
        result.submitted > 0
          ? `Anggota crew disimpan. ${result.submitted} perpindahan / pengeluaran karyawan ber-crew diajukan ke atasan + HR dan berlaku setelah disetujui.`
          : "Anggota crew disimpan; roster anggota dibangkitkan dari tanggal efektif.",
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anggota {crew.name}</DialogTitle>
          <DialogDescription>
            Karyawan yang dikeluarkan berhenti mengikuti crew ini mulai tanggal efektif. Karyawan
            hanya bisa di satu crew pada satu waktu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Tanggal efektif">
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              className="pl-8"
              placeholder="Cari nama atau NIP (min. 2 huruf)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {q.length >= 2 ? (
            <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
              {(results.data?.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {e.fullName}{" "}
                    <span className="text-muted-foreground font-mono text-xs">
                      {e.employeeNumber ?? ""}
                    </span>
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={has(e.id)}
                    onClick={() =>
                      setSelected((s) => [
                        ...s,
                        { id: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber },
                      ])
                    }
                  >
                    <UserPlus /> {has(e.id) ? "Sudah" : "Tambah"}
                  </Button>
                </li>
              ))}
              {results.data?.data.length === 0 ? (
                <li className="text-muted-foreground px-3 py-2 text-sm">Tidak ditemukan.</li>
              ) : null}
            </ul>
          ) : null}
          <div>
            <p className="mb-1 text-sm font-medium">Anggota ({selected.length})</p>
            <ul className="max-h-60 divide-y overflow-y-auto rounded-md border">
              {selected.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {m.fullName}{" "}
                    <span className="text-muted-foreground font-mono text-xs">
                      {m.employeeNumber ?? ""}
                    </span>
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Keluarkan ${m.fullName}`}
                    onClick={() => setSelected((s) => s.filter((x) => x.id !== m.id))}
                  >
                    <UserMinus />
                  </Button>
                </li>
              ))}
              {selected.length === 0 ? (
                <li className="text-muted-foreground px-3 py-2 text-sm">Belum ada anggota.</li>
              ) : null}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="brand" disabled={setMembers.isPending} onClick={() => void submit()}>
            Simpan anggota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
