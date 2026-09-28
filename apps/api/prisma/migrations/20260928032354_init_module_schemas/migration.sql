-- Migrasi awal Fase 1: membuat satu skema Postgres per modul (PLAN §3.2).
-- SQL mentah karena Prisma tidak membuat skema yang belum punya model.
-- Portabel (D-023): hanya perintah Postgres polos, tanpa objek/ekstensi milik Supabase.
CREATE SCHEMA IF NOT EXISTS "iam";
CREATE SCHEMA IF NOT EXISTS "organization";
CREATE SCHEMA IF NOT EXISTS "employee";
CREATE SCHEMA IF NOT EXISTS "attendance";
CREATE SCHEMA IF NOT EXISTS "leave";
CREATE SCHEMA IF NOT EXISTS "approval";
CREATE SCHEMA IF NOT EXISTS "contract";
CREATE SCHEMA IF NOT EXISTS "payroll";
CREATE SCHEMA IF NOT EXISTS "notification";
CREATE SCHEMA IF NOT EXISTS "audit";
