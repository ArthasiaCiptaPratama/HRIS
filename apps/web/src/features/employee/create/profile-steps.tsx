import {
  DRIVING_LICENSE_LABELS,
  DRIVING_LICENSE_TYPES,
  type DrivingLicenseType,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  RELIGION_LABELS,
  RELIGIONS,
} from "@hris/shared";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormSelect } from "@/components/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FormField } from "../components/employee-work-fields";
import type { EmployeeForm } from "../schemas";
import {
  type ChildState,
  type EducationState,
  emptyCertification,
  emptyChild,
  emptyEducation,
  emptySibling,
  type FamilyState,
  type ParentState,
  type PersonalState,
  type ProfileState,
} from "./profile-form";

// EMP-D2: langkah data profil Tambah karyawan bertahap. Label dwibahasa singkat mengikuti Google Form /
// Formulir Data Karyawan supaya HR bisa menyalin dari formulir kertas berurutan.

const GENDER_OPTIONS = (["MALE", "FEMALE"] as const).map((g) => ({
  value: g,
  label: GENDER_LABELS[g],
}));

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <legend className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            {title}
          </legend>
          {description ? <p className="text-muted-foreground mt-1 text-xs">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </fieldset>
  );
}

const Grid = ({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) => (
  <div
    className={cn(
      "grid grid-cols-1 gap-x-5 gap-y-4",
      cols === 2 && "sm:grid-cols-2",
      cols === 3 && "sm:grid-cols-3",
      cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
    )}
  >
    {children}
  </div>
);

function Text({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  inputMode,
  className,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "email" | "number";
  mono?: boolean;
  inputMode?: "numeric" | "tel" | "email";
  className?: string;
  hint?: string;
}) {
  return (
    <FormField label={label} htmlFor={id} className={className} {...(hint ? { hint } : {})}>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        className={mono ? "font-mono" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

function Choice({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Pilih",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <FormSelect
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        noneLabel="Tidak diisi"
        options={options}
      />
    </FormField>
  );
}

function RowCard({
  children,
  onRemove,
  label,
}: {
  children: ReactNode;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="bg-muted/30 relative rounded-xl border p-4 pr-12">
      {children}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground absolute top-2 right-2"
        aria-label={`Hapus ${label}`}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <Plus /> {children}
    </Button>
  );
}

const update = <T,>(list: T[], index: number, patch: Partial<T>): T[] =>
  list.map((row, i) => (i === index ? { ...row, ...patch } : row));

// ── Data pribadi & alamat ──────────────────────────────────────────────────────────────────

export function PersonalStep({
  value,
  onChange,
}: {
  value: PersonalState;
  onChange: (value: PersonalState) => void;
}) {
  const set = (patch: Partial<PersonalState>) => onChange({ ...value, ...patch });
  const t = (key: keyof PersonalState) => ({
    id: `p-${key}`,
    value: value[key] as string,
    onChange: (v: string) => set({ [key]: v } as Partial<PersonalState>),
  });
  const hasLicense = (type: DrivingLicenseType) => value.licenses.some((l) => l.type === type);
  const toggleLicense = (type: DrivingLicenseType) =>
    set({
      licenses: hasLicense(type)
        ? value.licenses.filter((l) => l.type !== type)
        : [...value.licenses, { type, number: "" }].sort(
            (a, b) => DRIVING_LICENSE_TYPES.indexOf(a.type) - DRIVING_LICENSE_TYPES.indexOf(b.type),
          ),
    });
  return (
    <div className="space-y-8">
      <Section title="Data pribadi / Personal data">
        <Grid>
          <Text label="Nama panggilan / Nickname" {...t("nickname")} />
          <Text label="Email pribadi" type="email" inputMode="email" {...t("personalEmail")} />
          <Text label="Tempat lahir / Place of birth" {...t("birthPlace")} />
          <Text label="Tanggal lahir / Date of birth" type="date" {...t("birthDate")} />
          <Choice
            label="Agama / Religion"
            {...t("religion")}
            options={RELIGIONS.map((r) => ({ value: r, label: RELIGION_LABELS[r] }))}
          />
          <Choice
            label="Status perkawinan / Marital status"
            {...t("maritalStatus")}
            options={MARITAL_STATUSES.map((m) => ({ value: m, label: MARITAL_STATUS_LABELS[m] }))}
          />
          <Text label="Kebangsaan / Nationality" {...t("nationality")} />
          <Text label="Suku / Tribe" {...t("ethnicity")} />
          <Text
            label="Golongan darah / Blood group"
            placeholder="A, B, AB, O"
            {...t("bloodType")}
          />
        </Grid>
      </Section>

      <Section title="Nomor identitas">
        <Grid>
          <Text
            label="No. KTP (NIK)"
            mono
            inputMode="numeric"
            placeholder="16 digit"
            {...t("ktpNumber")}
          />
          <Text
            label="No. Kartu Keluarga"
            mono
            inputMode="numeric"
            placeholder="16 digit"
            {...t("kkNumber")}
          />
          <Text
            label="NPWP / Tax ID"
            mono
            inputMode="numeric"
            placeholder="15 atau 16 digit"
            {...t("npwpNumber")}
          />
          <Text label="No. BPJS Ketenagakerjaan" mono {...t("bpjsEmploymentNumber")} />
          <Text label="No. BPJS Kesehatan" mono {...t("bpjsHealthNumber")} />
        </Grid>
      </Section>

      <Section
        title="SIM / Driving license"
        description="Pilih jenis SIM yang dimiliki, lalu isi nomornya."
      >
        <fieldset className="flex flex-wrap gap-1.5" aria-label="Jenis SIM">
          {DRIVING_LICENSE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={hasLicense(type)}
              onClick={() => toggleLicense(type)}
              className={cn(
                "h-8 rounded-full border px-3 text-sm transition-colors",
                hasLicense(type)
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              SIM {DRIVING_LICENSE_LABELS[type]}
            </button>
          ))}
        </fieldset>
        {value.licenses.length > 0 ? (
          <Grid cols={3}>
            {value.licenses.map((l, i) => (
              <Text
                key={l.type}
                id={`p-sim-${l.type}`}
                label={`No. SIM ${DRIVING_LICENSE_LABELS[l.type]}`}
                mono
                value={l.number}
                onChange={(number) => set({ licenses: update(value.licenses, i, { number }) })}
              />
            ))}
          </Grid>
        ) : null}
      </Section>

      <Section title="Alamat sekarang (domisili) / Present address">
        <FormField label="Alamat lengkap" htmlFor="p-domicileAddress">
          <Textarea
            id="p-domicileAddress"
            rows={2}
            value={value.domicileAddress}
            onChange={(e) => set({ domicileAddress: e.target.value })}
          />
        </FormField>
        <Grid cols={4}>
          <Text label="Kelurahan/Desa" {...t("domicileVillage")} />
          <Text label="Kecamatan" {...t("domicileDistrict")} />
          <Text label="Kab./Kota" {...t("domicileCity")} />
          <Text label="Provinsi" {...t("domicileProvince")} />
        </Grid>
      </Section>

      <Section title="Alamat tetap (KTP) / Permanent address">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand size-4"
            checked={value.ktpSameAsDomicile}
            onChange={(e) => set({ ktpSameAsDomicile: e.target.checked })}
          />
          Sama dengan alamat domisili
        </label>
        {value.ktpSameAsDomicile ? null : (
          <>
            <FormField label="Alamat lengkap sesuai KTP" htmlFor="p-ktpAddress">
              <Textarea
                id="p-ktpAddress"
                rows={2}
                value={value.ktpAddress}
                onChange={(e) => set({ ktpAddress: e.target.value })}
              />
            </FormField>
            <Grid cols={4}>
              <Text label="Kelurahan/Desa (KTP)" {...t("ktpVillage")} />
              <Text label="Kecamatan (KTP)" {...t("ktpDistrict")} />
              <Text label="Kab./Kota (KTP)" {...t("ktpCity")} />
              <Text label="Provinsi (KTP)" {...t("ktpProvince")} />
            </Grid>
          </>
        )}
      </Section>
    </div>
  );
}

// ── Kontak darurat ──────────────────────────────────────────────────────────────────────────

export function EmergencyStep({
  form,
  value,
  onChange,
  canPersonal,
}: {
  form: UseFormReturn<EmployeeForm>;
  value: ProfileState["emergency"];
  onChange: (value: ProfileState["emergency"]) => void;
  canPersonal: boolean;
}) {
  const { register, formState } = form;
  const set = (patch: Partial<ProfileState["emergency"]>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-8">
      <Section title="Kontak darurat 1">
        <Grid cols={3}>
          <FormField label="Nama / Name" htmlFor="e-name">
            <Input id="e-name" {...register("emergencyContactName")} />
          </FormField>
          <FormField label="Hubungan / Relation" htmlFor="e-rel">
            <Input
              id="e-rel"
              placeholder="Mis. Istri, Ayah"
              {...register("emergencyContactRelationship")}
            />
          </FormField>
          <FormField
            label="No. telepon / Telephone"
            htmlFor="e-phone"
            error={formState.errors.emergencyPhone?.message}
          >
            <Input
              id="e-phone"
              inputMode="tel"
              className="font-mono"
              {...register("emergencyPhone")}
            />
          </FormField>
        </Grid>
        {canPersonal ? (
          <FormField label="Alamat / Address" htmlFor="e-address">
            <Textarea
              id="e-address"
              rows={2}
              value={value.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          </FormField>
        ) : null}
      </Section>
      {canPersonal ? (
        <Section title="Kontak darurat 2">
          <Grid cols={3}>
            <Text
              id="e2-name"
              label="Nama / Name"
              value={value.name2}
              onChange={(v) => set({ name2: v })}
            />
            <Text
              id="e2-rel"
              label="Hubungan / Relation"
              value={value.relationship2}
              onChange={(v) => set({ relationship2: v })}
            />
            <Text
              id="e2-phone"
              label="No. telepon / Telephone"
              mono
              inputMode="tel"
              value={value.phone2}
              onChange={(v) => set({ phone2: v })}
            />
          </Grid>
          <FormField label="Alamat / Address" htmlFor="e2-address">
            <Textarea
              id="e2-address"
              rows={2}
              value={value.address2}
              onChange={(e) => set({ address2: e.target.value })}
            />
          </FormField>
        </Section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Alamat kontak darurat dan kontak darurat ke-2 termasuk data pribadi (butuh izin
          <span className="font-mono"> employee.personal.write</span>).
        </p>
      )}
    </div>
  );
}

// ── Keluarga ────────────────────────────────────────────────────────────────────────────────

function ParentFields({
  prefix,
  label,
  value,
  onChange,
}: {
  prefix: string;
  label: string;
  value: ParentState;
  onChange: (value: ParentState) => void;
}) {
  const set = (patch: Partial<ParentState>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <Text
          id={`${prefix}-name`}
          label={`Nama ${label}`}
          value={value.name}
          onChange={(v) => set({ name: v })}
        />
        <Text
          id={`${prefix}-age`}
          label="Usia / Age"
          type="number"
          value={value.age}
          onChange={(v) => set({ age: v })}
        />
        <Text
          id={`${prefix}-edu`}
          label="Pendidikan / Education"
          value={value.education}
          onChange={(v) => set({ education: v })}
        />
        <Text
          id={`${prefix}-job`}
          label="Pekerjaan / Occupation"
          value={value.occupation}
          onChange={(v) => set({ occupation: v })}
        />
      </Grid>
      <label className="text-muted-foreground flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-brand size-4"
          checked={value.deceased}
          onChange={(e) => set({ deceased: e.target.checked })}
        />
        Sudah meninggal (Alm.)
      </label>
    </div>
  );
}

export function FamilyStep({
  value,
  onChange,
}: {
  value: FamilyState;
  onChange: (value: FamilyState) => void;
}) {
  const set = (patch: Partial<FamilyState>) => onChange({ ...value, ...patch });
  const spouse = value.spouse;
  const setSpouse = (patch: Partial<FamilyState["spouse"]>) =>
    set({ spouse: { ...spouse, ...patch } });
  const setChild = (i: number, patch: Partial<ChildState>) =>
    set({ children: update(value.children, i, patch) });
  return (
    <div className="space-y-8">
      <Section title="Istri/Suami / Spouse">
        <Grid>
          <Text
            id="f-spouse-name"
            label="Nama / Name"
            value={spouse.name}
            onChange={(v) => setSpouse({ name: v })}
          />
          <Text
            id="f-spouse-place"
            label="Tempat lahir / Place of birth"
            value={spouse.birthPlace}
            onChange={(v) => setSpouse({ birthPlace: v })}
          />
          <Text
            id="f-spouse-date"
            label="Tanggal lahir / Date of birth"
            type="date"
            value={spouse.birthDate}
            onChange={(v) => setSpouse({ birthDate: v })}
          />
          <Text
            id="f-spouse-job"
            label="Pekerjaan / Occupation"
            value={spouse.occupation}
            onChange={(v) => setSpouse({ occupation: v })}
          />
          <Text
            id="f-spouse-work"
            label="Alamat kerja / Working address"
            className="sm:col-span-2"
            value={spouse.workAddress}
            onChange={(v) => setSpouse({ workAddress: v })}
          />
        </Grid>
      </Section>

      <Section
        title="Anak / Children"
        action={
          <AddButton onClick={() => set({ children: [...value.children, emptyChild()] })}>
            Tambah anak
          </AddButton>
        }
      >
        {value.children.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada data anak.</p>
        ) : (
          value.children.map((c, i) => (
            <RowCard
              // biome-ignore lint/suspicious/noArrayIndexKey: baris form berurutan tanpa id
              key={i}
              label={`anak ${i + 1}`}
              onRemove={() => set({ children: value.children.filter((_, j) => j !== i) })}
            >
              <Grid cols={3}>
                <Text
                  id={`f-child-name-${i}`}
                  label={`Nama anak ${i + 1}`}
                  value={c.name}
                  onChange={(v) => setChild(i, { name: v })}
                />
                <FormField label="L/P" htmlFor={`f-child-gender-${i}`}>
                  <FormSelect
                    id={`f-child-gender-${i}`}
                    value={c.gender}
                    onChange={(v) => setChild(i, { gender: v })}
                    placeholder="Pilih"
                    noneLabel="Tidak diisi"
                    options={GENDER_OPTIONS}
                  />
                </FormField>
                <Text
                  id={`f-child-place-${i}`}
                  label="Tempat lahir"
                  value={c.birthPlace}
                  onChange={(v) => setChild(i, { birthPlace: v })}
                />
                <Text
                  id={`f-child-date-${i}`}
                  label="Tanggal lahir"
                  type="date"
                  value={c.birthDate}
                  onChange={(v) => setChild(i, { birthDate: v })}
                />
                <Text
                  id={`f-child-edu-${i}`}
                  label="Pendidikan"
                  value={c.education}
                  onChange={(v) => setChild(i, { education: v })}
                />
                <Text
                  id={`f-child-job-${i}`}
                  label="Pekerjaan"
                  value={c.occupation}
                  onChange={(v) => setChild(i, { occupation: v })}
                />
              </Grid>
            </RowCard>
          ))
        )}
      </Section>

      <Section title="Ayah / Father">
        <ParentFields
          prefix="f-father"
          label="ayah"
          value={value.father}
          onChange={(father) => set({ father })}
        />
      </Section>
      <Section title="Ibu / Mother">
        <ParentFields
          prefix="f-mother"
          label="ibu"
          value={value.mother}
          onChange={(mother) => set({ mother })}
        />
      </Section>

      <Section
        title="Saudara kandung / Brother & sister"
        action={
          <AddButton onClick={() => set({ siblings: [...value.siblings, emptySibling()] })}>
            Tambah saudara
          </AddButton>
        }
      >
        {value.siblings.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada data saudara.</p>
        ) : (
          value.siblings.map((s, i) => (
            <RowCard
              // biome-ignore lint/suspicious/noArrayIndexKey: baris form berurutan tanpa id
              key={i}
              label={`saudara ${i + 1}`}
              onRemove={() => set({ siblings: value.siblings.filter((_, j) => j !== i) })}
            >
              <Grid cols={3}>
                <Text
                  id={`f-sib-name-${i}`}
                  label={`Nama saudara ${i + 1}`}
                  value={s.name}
                  onChange={(v) => set({ siblings: update(value.siblings, i, { name: v }) })}
                />
                <Text
                  id={`f-sib-age-${i}`}
                  label="Usia"
                  type="number"
                  value={s.age}
                  onChange={(v) => set({ siblings: update(value.siblings, i, { age: v }) })}
                />
                <FormField label="Status hubungan" htmlFor={`f-sib-rel-${i}`}>
                  <FormSelect
                    id={`f-sib-rel-${i}`}
                    value={s.relationDetail}
                    onChange={(v) =>
                      set({ siblings: update(value.siblings, i, { relationDetail: v }) })
                    }
                    placeholder="Kakak/Adik"
                    noneLabel="Tidak diisi"
                    options={[
                      { value: "Kakak", label: "Kakak" },
                      { value: "Adik", label: "Adik" },
                    ]}
                  />
                </FormField>
                <Text
                  id={`f-sib-edu-${i}`}
                  label="Pendidikan"
                  value={s.education}
                  onChange={(v) => set({ siblings: update(value.siblings, i, { education: v }) })}
                />
                <Text
                  id={`f-sib-job-${i}`}
                  label="Pekerjaan"
                  value={s.occupation}
                  onChange={(v) => set({ siblings: update(value.siblings, i, { occupation: v }) })}
                />
              </Grid>
            </RowCard>
          ))
        )}
      </Section>
    </div>
  );
}

// ── Rekening ────────────────────────────────────────────────────────────────────────────────

export function BankStep({
  value,
  onChange,
}: {
  value: ProfileState["bank"];
  onChange: (value: ProfileState["bank"]) => void;
}) {
  const set = (patch: Partial<ProfileState["bank"]>) => onChange({ ...value, ...patch });
  return (
    <Section
      title="Data rekening"
      description="Kosongkan bila belum ada; bisa dilengkapi di Data Bank."
    >
      <Grid cols={3}>
        <Text
          id="b-bank"
          label="Nama bank / Bank name"
          value={value.bankName}
          onChange={(v) => set({ bankName: v })}
        />
        <Text
          id="b-number"
          label="Nomor rekening / Account number"
          mono
          inputMode="numeric"
          value={value.accountNumber}
          onChange={(v) => set({ accountNumber: v })}
        />
        <Text
          id="b-holder"
          label="Nama pemilik rekening"
          value={value.accountHolder}
          onChange={(v) => set({ accountHolder: v })}
        />
      </Grid>
    </Section>
  );
}

// ── Pendidikan & sertifikasi ────────────────────────────────────────────────────────────────

export function EducationStep({
  educations,
  certifications,
  onChange,
}: {
  educations: EducationState[];
  certifications: ProfileState["certifications"];
  onChange: (patch: Partial<Pick<ProfileState, "educations" | "certifications">>) => void;
}) {
  return (
    <div className="space-y-8">
      <Section
        title="Pendidikan / Education"
        description="Mulai dari pendidikan terakhir/tertinggi."
        action={
          <AddButton onClick={() => onChange({ educations: [...educations, emptyEducation()] })}>
            Tambah pendidikan
          </AddButton>
        }
      >
        {educations.map((e, i) => (
          <RowCard
            // biome-ignore lint/suspicious/noArrayIndexKey: baris form berurutan tanpa id
            key={i}
            label={`pendidikan ${i + 1}`}
            onRemove={() => onChange({ educations: educations.filter((_, j) => j !== i) })}
          >
            <Grid cols={3}>
              <FormField label="Jenjang / Level" htmlFor={`ed-level-${i}`}>
                <FormSelect
                  id={`ed-level-${i}`}
                  value={e.level}
                  onChange={(v) => onChange({ educations: update(educations, i, { level: v }) })}
                  placeholder="Pilih jenjang"
                  noneLabel="Tidak diisi"
                  options={EDUCATION_LEVELS.map((l) => ({
                    value: l,
                    label: EDUCATION_LEVEL_LABELS[l],
                  }))}
                />
              </FormField>
              <Text
                id={`ed-school-${i}`}
                label="Nama sekolah/universitas & kota"
                className="sm:col-span-2"
                value={e.schoolName}
                onChange={(v) => onChange({ educations: update(educations, i, { schoolName: v }) })}
              />
              <Text
                id={`ed-major-${i}`}
                label="Jurusan"
                value={e.major}
                onChange={(v) => onChange({ educations: update(educations, i, { major: v }) })}
              />
              <Text
                id={`ed-from-${i}`}
                label="Tahun masuk / From"
                type="number"
                value={e.entryYear}
                onChange={(v) => onChange({ educations: update(educations, i, { entryYear: v }) })}
              />
              <Text
                id={`ed-to-${i}`}
                label="Tahun lulus / To"
                type="number"
                value={e.graduationYear}
                onChange={(v) =>
                  onChange({ educations: update(educations, i, { graduationYear: v }) })
                }
              />
            </Grid>
          </RowCard>
        ))}
      </Section>

      <Section
        title="Sertifikasi / Certification"
        action={
          <AddButton
            onClick={() => onChange({ certifications: [...certifications, emptyCertification()] })}
          >
            Tambah sertifikasi
          </AddButton>
        }
      >
        {certifications.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada sertifikasi.</p>
        ) : (
          certifications.map((c, i) => (
            <RowCard
              // biome-ignore lint/suspicious/noArrayIndexKey: baris form berurutan tanpa id
              key={i}
              label={`sertifikasi ${i + 1}`}
              onRemove={() =>
                onChange({ certifications: certifications.filter((_, j) => j !== i) })
              }
            >
              <Grid cols={3}>
                <Text
                  id={`ct-name-${i}`}
                  label="Jenis sertifikasi"
                  value={c.name}
                  onChange={(v) =>
                    onChange({ certifications: update(certifications, i, { name: v }) })
                  }
                />
                <Text
                  id={`ct-number-${i}`}
                  label="No. sertifikasi"
                  mono
                  value={c.number}
                  onChange={(v) =>
                    onChange({ certifications: update(certifications, i, { number: v }) })
                  }
                />
                <Text
                  id={`ct-year-${i}`}
                  label="Tahun terbit"
                  type="number"
                  value={c.year}
                  onChange={(v) =>
                    onChange({ certifications: update(certifications, i, { year: v }) })
                  }
                />
              </Grid>
            </RowCard>
          ))
        )}
      </Section>
    </div>
  );
}
