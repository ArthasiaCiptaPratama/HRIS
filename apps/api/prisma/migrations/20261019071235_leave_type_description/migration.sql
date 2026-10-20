-- AlterTable
ALTER TABLE "leave"."leave_types" ADD COLUMN     "description" VARCHAR(300),
ADD COLUMN     "document_label" VARCHAR(120);

-- Isian bawaan jenis cuti/izin bawaan (hanya bila masih kosong; isian SA tidak ditimpa).
UPDATE "leave"."leave_types" SET "description" = 'Cuti tahunan dari saldo cuti Anda. Hari OFF roster dan tanggal merah tidak dihitung.' WHERE "code" = 'CUTI_TAHUNAN' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Tidak masuk karena sakit. Lebih dari 1 hari wajib melampirkan surat keterangan dokter.' WHERE "code" = 'SAKIT' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Surat keterangan dokter' WHERE "code" = 'SAKIT' AND "document_label" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Pernikahan karyawan sendiri.' WHERE "code" = 'IZIN_MENIKAH' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Undangan pernikahan / buku nikah' WHERE "code" = 'IZIN_MENIKAH' AND "document_label" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Menikahkan anak kandung.' WHERE "code" = 'IZIN_ANAK_MENIKAH' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Undangan pernikahan anak' WHERE "code" = 'IZIN_ANAK_MENIKAH' AND "document_label" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Khitanan atau pembaptisan anak.' WHERE "code" = 'IZIN_KHITAN_BAPTIS' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Undangan / surat keterangan acara' WHERE "code" = 'IZIN_KHITAN_BAPTIS' AND "document_label" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Istri melahirkan atau keguguran kandungan.' WHERE "code" = 'IZIN_ISTRI_LAHIR' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Surat keterangan kelahiran / dokter / bidan' WHERE "code" = 'IZIN_ISTRI_LAHIR' AND "document_label" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Suami/istri, orang tua/mertua, atau anak/menantu meninggal dunia.' WHERE "code" = 'IZIN_DUKA' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Surat keterangan kematian' WHERE "code" = 'IZIN_DUKA' AND "document_label" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Anggota keluarga dalam satu rumah meninggal dunia.' WHERE "code" = 'IZIN_DUKA_SERUMAH' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Surat keterangan kematian' WHERE "code" = 'IZIN_DUKA_SERUMAH' AND "document_label" IS NULL;
UPDATE "leave"."leave_types" SET "description" = 'Keperluan lain di luar jenis di atas — jelaskan di kolom alasan.' WHERE "code" = 'IZIN_LAIN' AND "description" IS NULL;
UPDATE "leave"."leave_types" SET "document_label" = 'Dokumen pendukung (bila ada)' WHERE "code" = 'IZIN_LAIN' AND "document_label" IS NULL;
