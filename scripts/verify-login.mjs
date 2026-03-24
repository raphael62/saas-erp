/**
 * Verify login works with admin@example.com / Admin123!
 * Run: node scripts/verify-login.mjs
 * Uses same credentials as the app - confirms project + password.
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

console.log("Testing login against:", url);

const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await client.auth.signInWithPassword({
    email: "admin@example.com",
    password: "Admin123!",
  });

  if (error) {
    console.error("Login FAILED:", error.message);
    process.exit(1);
  }

  console.log("Login OK - user id:", data.user?.id);
  console.log("The app should work. If it does not, restart the dev server (npm run dev) and clear browser cache.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
