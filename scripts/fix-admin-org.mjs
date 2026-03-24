/**
 * Fix admin user's organization assignment.
 * Run: node scripts/fix-admin-org.mjs
 * Links admin@example.com to the org with code 294386.
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
          if (key && !process.env[key]) process.env[key] = val;
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
const CODE = "294386";

async function main() {
  // Find user by profile email (avoids listUsers pagination)
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, email, organization_id")
    .eq("email", EMAIL);

  if (profErr) {
    console.error("Profile lookup failed:", profErr.message);
    process.exit(1);
  }

  const profile = profiles?.[0];
  if (!profile) {
    console.error("No profile found for", EMAIL);
    console.error("Run: npm run seed:admin");
    process.exit(1);
  }

  const userId = profile.id;
  console.log("Found profile:", { id: userId, email: profile.email, current_org_id: profile.organization_id });

  // Find org by code
  const { data: orgs, error: orgErr } = await admin
    .from("organizations")
    .select("id, code")
    .eq("code", CODE);

  if (orgErr) {
    console.error("Org lookup failed:", orgErr.message);
    process.exit(1);
  }

  const org = orgs?.[0];
  if (!org) {
    console.error("No org found with code", CODE);
    const { data: allOrgs } = await admin.from("organizations").select("id, code, name");
    console.error("Existing orgs:", allOrgs);
    process.exit(1);
  }

  console.log("Found org:", { id: org.id, code: org.code });

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ organization_id: org.id, role: "super_admin" })
    .eq("id", userId);

  if (updateErr) {
    console.error("Profile update failed:", updateErr.message);
    process.exit(1);
  }

  await admin.from("organizations").update({ created_by: userId }).eq("id", org.id).is("created_by", null);

  // Verify
  const { data: verify } = await admin.from("profiles").select("organization_id").eq("id", userId).single();
  console.log("\nVerified profile.organization_id:", verify?.organization_id);

  console.log("\n--- Login credentials ---");
  console.log("Company code:", CODE);
  console.log("Email:       ", EMAIL);
  console.log("Password:    Admin123!");
  console.log("\nTry logging in at http://localhost:3000/login");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
