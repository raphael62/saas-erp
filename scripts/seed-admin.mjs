/**
 * One-time script to create an admin user and organization.
 * Run: node scripts/seed-admin.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Creates: org "Demo Company" with a 6-digit code, and a user you can log in with.
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
const COMPANY = "Demo Company";

async function main() {
  const { data: regData, error: regErr } = await admin.rpc("start_registration", {
    p_company_name: COMPANY,
    p_phone: null,
  });

  if (regErr) {
    console.error("start_registration failed:", regErr.message);
    process.exit(1);
  }

  const orgId = regData?.org_id;
  const code = regData?.code;
  if (!orgId || !code) {
    console.error("No org_id or code returned");
    process.exit(1);
  }

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { organization_id: orgId, full_name: "Admin User" },
  });

  if (userErr) {
    console.error("createUser failed:", userErr.message);
    process.exit(1);
  }

  const userId = userData?.user?.id;
  if (!userId) {
    console.error("No user id returned");
    process.exit(1);
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ organization_id: orgId, full_name: "Admin User", role: "super_admin" })
    .eq("id", userId);
  if (profileErr) {
    console.error("Profile update failed:", profileErr.message);
    process.exit(1);
  }
  await admin.from("organizations").update({ created_by: userId }).eq("id", orgId).is("created_by", null);

  console.log("\n--- Login credentials ---\n");
  console.log("Company code:", code);
  console.log("Email:       ", EMAIL);
  console.log("Password:    ", PASSWORD);
  console.log("\nUse these at http://localhost:3000/login\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
