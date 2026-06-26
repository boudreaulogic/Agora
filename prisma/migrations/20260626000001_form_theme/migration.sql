-- Per-form appearance/theme for the public + embedded render.
ALTER TABLE "agora_forms" ADD COLUMN IF NOT EXISTS "theme" JSONB;
