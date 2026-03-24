/**
 * Fix ALL profiles with no organization_id by assigning them to the org with code 294386.
 * Run: node scripts/fix-all-orphan-profiles.mjs
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
  console.error("Missing env vars");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CODE = "294386";

async function main() {
  const { data: org } = await admin.from("organizations").select("id").eq("code", CODE).single();
  if (!org) {
    console.error("Org with code", CODE, "not found");
    process.exit(1);
  }

  const { data: orphans } = await admin
    .from("profiles")
    .select("id, email")
    .is("organization_id", null);

  if (!orphans?.length) {
    console.log("No orphan profiles found. All users have organizations.");
    return;
  }

  console.log("Fixing", orphans.length, "orphan profile(s):", orphans.map((p) => p.email).join(", "));

  for (const p of orphans) {
    const { error } = await admin
      .from("profiles")
      .update({ organization_id: org.id, role: "super_admin" })
      .eq("id", p.id);
    if (error) {
      console.error("Failed for", p.email, error.message);
    } else {
      console.log("Fixed:", p.email);
    }
  }

  await admin.from("organizations").update({ created_by: orphans[0].id }).eq("id", org.id).is("created_by", null);

  console.log("\nDone. Try logging in with your email, code", CODE, "and password.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
