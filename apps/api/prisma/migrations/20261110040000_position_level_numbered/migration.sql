-- ORG-D1 (mengubah D-050 (4)): level jabatan bernomor 1b–7 sesuai legenda bagan site ACP.
-- Data lama dipetakan; tidak ada baris yang dihapus. GM disetarakan KTT (L5), Direksi = L6 (Direktur Utama
-- L7 diisi lewat data).
CREATE TYPE "organization"."PositionLevel_new" AS ENUM ('L7', 'L6', 'L5', 'L4', 'L3', 'L2', 'L1A', 'L1B');

ALTER TABLE "organization"."positions"
  ALTER COLUMN "level" TYPE "organization"."PositionLevel_new"
  USING (
    CASE "level"::text
      WHEN 'DIRECTOR' THEN 'L6'
      WHEN 'GENERAL_MANAGER' THEN 'L5'
      WHEN 'SUPERINTENDENT' THEN 'L4'
      WHEN 'MANAGER' THEN 'L3'
      WHEN 'SUPERVISOR' THEN 'L3'
      WHEN 'FOREMAN' THEN 'L2'
      WHEN 'STAFF' THEN 'L1A'
      WHEN 'NON_STAFF' THEN 'L1B'
    END
  )::"organization"."PositionLevel_new";

DROP TYPE "organization"."PositionLevel";
ALTER TYPE "organization"."PositionLevel_new" RENAME TO "PositionLevel";
