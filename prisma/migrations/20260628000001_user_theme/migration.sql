-- Account-bound appearance preference (light | dark). Default light for everyone;
-- only changeable from the user's own profile settings.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'light';
