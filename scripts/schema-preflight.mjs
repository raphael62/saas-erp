/**
 * Dev schema preflight check for Supabase.
 * Run: node scripts/schema-preflight.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const cwd = process.cwd();
  const paths = [resolve(cwd, ".env.local"), resolve(cwd, ".env")];
  for (const full of paths) {
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = val;
    }
    break;
  }
}

const requiredSchema = {
  organizations: [
    "id",
    "code",
    "name",
    "subscription_ends_at",
    "inventory_history_anchor_date",
    "inventory_history_start_date",
  ],
  profiles: ["id", "organization_id", "role", "theme_accent_hex"],
  products: [
    "id",
    "organization_id",
    "name",
    "code",
    "pack_unit",
    "empties_type",
    "plastic_cost",
    "bottle_cost",
    "reorder_qty",
    "barcode",
    "supplier_id",
    "is_active",
    "taxable",
    "returnable",
  ],
  sales_reps: ["id", "organization_id", "email", "first_name", "last_name", "sales_rep_type", "location"],
  location_transfers: [
    "id",
    "organization_id",
    "transfer_no",
    "transfer_date",
    "request_date",
    "from_location_id",
    "to_location_id",
    "product_id",
    "qty",
    "status",
  ],
  location_transfer_lines: [
    "id",
    "organization_id",
    "location_transfer_id",
    "product_id",
    "cartons",
    "bottles",
    "ctn_qty",
    "row_no",
  ],
  location_types: ["id", "organization_id", "name"],
  brand_categories: ["id", "organization_id", "name"],
  empties_types: ["id", "organization_id", "name"],
  price_types: ["id", "organization_id", "name"],
  units_of_measure: ["id", "organization_id", "name"],
  payment_methods: ["id", "organization_id", "name"],
  customer_groups: ["id", "organization_id", "name"],
  customer_types: ["id", "organization_id", "name"],
  inventory_stock_snapshots: [
    "organization_id",
    "snapshot_date",
    "product_id",
    "closing_qty",
    "updated_at",
  ],
};

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local/.env");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const failures = [];
  for (const [table, requiredColumns] of Object.entries(requiredSchema)) {
    const selectExpr = requiredColumns.join(",");
    const { error } = await admin.from(table).select(selectExpr).limit(1);
    if (!error) continue;

    const message = error.message || "";
    if (message.toLowerCase().includes("could not find the table")) {
      failures.push(`Missing table: public.${table}`);
      continue;
    }

    const missingColumnMatch = message.match(/Could not find the '([^']+)' column/i);
    if (missingColumnMatch?.[1]) {
      failures.push(`Missing column: public.${table}.${missingColumnMatch[1]}`);
      continue;
    }

    failures.push(`Table check failed: public.${table} -> ${message}`);
  }

  if (failures.length > 0) {
    console.error("\nSchema preflight FAILED:\n");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error("\nRun migrations under supabase/migrations/ (e.g. 047_dev_schema_drift_guard.sql, 048_inventory_stock_snapshots.sql).");
    process.exit(1);
  }

  console.log("Schema preflight PASSED: critical public tables/columns are present.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
