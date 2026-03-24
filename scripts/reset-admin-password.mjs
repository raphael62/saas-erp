/**
 * Reset admin@example.com password to Admin123!
 * Run: node scripts/reset-admin-password.mjs
 * Use when "Invalid login credentials" and the user already exists.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const cwd = process.cwd();
  const paths = [resolve(cwd, ".env.local"), resolve(cwd, ".env")];
  for (const full of paths) {
    if (existsSync(full)) {
      const content = readFileSync(full, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) {
          const key = m[1].trim();
          const val = m[2].trim().replace(/^["']|["']$/g, "");
          if (key) process.env[key] = val;
        }
      }
      break;
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const EMAIL = "admin@example.com";
const PASSWORD = "Admin123!";

async function main() {
  const { data: listData } = await admin.auth.admin.listUsers();
  const user = listData?.users?.find((u) => u.email === EMAIL);
  if (!user) {
    console.error("User", EMAIL, "not found. Run npm run seed:admin first.");
    process.exit(1);
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, { password: PASSWORD });
  if (error) {
    console.error("Password update failed:", error.message);
    process.exit(1);
  }

  console.log("\nPassword reset for", EMAIL);
  console.log("Log in with password:", PASSWORD);
  console.log("Project:", url);
  console.log("Company code: leave blank (DEV_BYPASS_ORG)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
