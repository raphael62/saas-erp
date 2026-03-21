"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCsv, type CsvRow } from "@/lib/csv";
import { importProductsCsv } from "@/app/dashboard/inventory/actions";
import { importCustomersCsv } from "@/app/dashboard/sales/actions";
import { importSalesRepsCsv } from "@/app/dashboard/sales/sales-reps/actions";
import { importPriceListsCsv } from "@/app/dashboard/sales/price-list/actions";

type ImportKey = "products" | "customers" | "sales_reps" | "price_lists";

type ImportConfig = {
  key: ImportKey;
  label: string;
  title: string;
  description: string;
  templateUrl: string;
  requiredColumns: string[];
  previewColumns: string[];
  importer: (formData: FormData) => Promise<{ ok?: boolean; error?: string; count?: number }>;
};

const IMPORTS: ImportConfig[] = [
  {
    key: "products",
    label: "Products",
    title: "Imports - Products",
    description: "Add or update products by SKU / product code.",
    templateUrl: "/import-templates/products-template.csv",
    requiredColumns: ["product_code", "product_name"],
    previewColumns: ["product_code", "product_name", "brand_category", "unit_of_measure", "status"],
    importer: importProductsCsv,
  },
  {
    key: "customers",
    label: "Customers",
    title: "Imports - Customers",
    description: "Create or update customer records in bulk.",
    templateUrl: "/import-templates/customers-template.csv",
    requiredColumns: ["customer_name"],
    previewColumns: ["customer_code", "customer_name", "mobile", "price_type", "status"],
    importer: importCustomersCsv,
  },
  {
    key: "sales_reps",
    label: "Sales Reps",
    title: "Imports - Sales Reps",
    description: "Create or update sales representatives in bulk.",
    templateUrl: "/import-templates/sales-reps-template.csv",
    requiredColumns: ["first_name", "last_name"],
    previewColumns: ["executive_code", "first_name", "last_name", "sales_rep_type", "status"],
    importer: importSalesRepsCsv,
  },
  {
    key: "price_lists",
    label: "Product Prices",
    title: "Imports - Product Prices",
    description: "Create price list headers and line items from CSV.",
    templateUrl: "/import-templates/price-list-template.csv",
    requiredColumns: ["price_list_name", "price_type", "effective_date", "product_code", "price_tax_inc"],
    previewColumns: ["price_list_name", "price_type", "effective_date", "product_code", "price_tax_inc"],
    importer: importPriceListsCsv,
  },
];

function hasRequired(row: CsvRow, required: string[]) {
  return required.every((col) => String(row[col] ?? "").trim().length > 0);
}

export function ImportDataManager() {
  const [activeKey, setActiveKey] = useState<ImportKey>("products");
  const [previewRows, setPreviewRows] = useState(25);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const active = useMemo(
    () => IMPORTS.find((cfg) => cfg.key === activeKey) ?? IMPORTS[0],
    [activeKey]
  );

  const validRows = useMemo(
    () => rows.filter((row) => hasRequired(row, active.requiredColumns)),
    [rows, active.requiredColumns]
  );

  async function onFileSelected(nextFile: File) {
    setMessage(null);
    setFile(nextFile);
    const text = await nextFile.text();
    setRows(parseCsv(text));
  }

  async function handleImport() {
    if (!file) {
      setMessage("Choose a CSV file first.");
      return;
    }
    setMessage(null);
    setPending(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await active.importer(fd);
    setPending(false);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setMessage(`Imported ${result?.count ?? 0} ${active.label.toLowerCase()} records.`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
      <aside className="rounded border border-border bg-card p-2">
        <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imports</p>
        <nav className="space-y-1">
          {IMPORTS.map((cfg) => {
            const activeItem = cfg.key === active.key;
            return (
              <button
                key={cfg.key}
                type="button"
                onClick={() => {
                  setActiveKey(cfg.key);
                  setRows([]);
                  setFile(null);
                  setMessage(null);
                }}
                className={`block w-full rounded px-2.5 py-2 text-left text-sm ${
                  activeItem ? "text-white" : "hover:bg-muted"
                }`}
                style={activeItem ? { backgroundColor: "var(--navbar)" } : undefined}
              >
                {cfg.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{active.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
        </div>

        <div className="rounded border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={active.templateUrl} download>
                <Download className="h-4 w-4" />
                Download template
              </a>
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()} style={{ backgroundColor: "var(--navbar)" }} className="text-white">
              <Upload className="h-4 w-4" />
              Choose CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const selected = e.target.files?.[0];
                if (!selected) return;
                await onFileSelected(selected);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="text-muted-foreground">Preview rows</label>
            <select
              className="h-8 rounded border border-input bg-background px-2 text-sm"
              value={previewRows}
              onChange={(e) => setPreviewRows(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="text-muted-foreground">Rows loaded: {rows.length}</span>
            <span className="text-muted-foreground">Valid rows: {validRows.length}</span>
            <Button
              size="sm"
              disabled={pending || !file || validRows.length === 0}
              onClick={handleImport}
              style={{ backgroundColor: "var(--navbar)" }}
              className="text-white"
            >
              {pending ? "Importing..." : "Import valid rows"}
            </Button>
          </div>
          {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
        </div>

        <div className="rounded border border-border bg-card">
          <div className="border-b border-border px-4 py-2">
            <h2 className="text-sm font-medium">Preview</h2>
            <p className="text-xs text-muted-foreground">Mapped columns from selected CSV file.</p>
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/40">
                <tr>
                  <th className="border-b border-r border-border px-2 py-2 text-left">Row</th>
                  {active.previewColumns.map((col) => (
                    <th key={col} className="border-b border-r border-border px-2 py-2 text-left">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={active.previewColumns.length + 1} className="px-2 py-6 text-center text-muted-foreground">
                      No preview yet. Choose a CSV file to get started.
                    </td>
                  </tr>
                ) : (
                  rows.slice(0, previewRows).map((row, idx) => (
                    <tr key={`${idx}-${row[active.previewColumns[0]] ?? ""}`} className="border-b border-border last:border-0">
                      <td className="border-r border-border px-2 py-1.5">{idx + 1}</td>
                      {active.previewColumns.map((col) => (
                        <td key={`${idx}-${col}`} className="border-r border-border px-2 py-1.5">
                          {row[col] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
