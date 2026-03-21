"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { savePurchaseInvoice } from "@/app/dashboard/purchases/purchase-invoices/actions";

type Product = {
  id: string | number;
  code?: string | null;
  name: string;
  pack_unit?: number | null;
  stock_quantity?: number | null;
  empties_type?: string | null;
  bottle_cost?: number | null;
  plastic_cost?: number | null;
  returnable?: boolean | null;
};
type PriceList = {
  id: string;
  price_type_id?: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  is_active?: boolean | null;
  price_types?: { id?: string; code?: string | null; name?: string | null } | null;
};
type PriceListItem = {
  price_list_id: string;
  product_id: string | number;
  price?: number | null;
  tax_rate?: number | null;
};
type Supplier = { id: string; name: string; payment_terms?: number | null };
type Location = { id: string; code?: string | null; name: string };

type Invoice = {
  id: string;
  invoice_no: string;
  supplier_id?: string | null;
  location_id?: string | null;
  invoice_date: string;
  delivery_date?: string | null;
  due_date?: string | null;
  payment_date?: string | null;
  supplier_inv_no?: string | null;
  empties_inv_no?: string | null;
  pi_no?: string | null;
  delivery_note_no?: string | null;
  transporter?: string | null;
  driver_name?: string | null;
  vehicle_no?: string | null;
  print_qty?: string | null;
  notes?: string | null;
  balance_os?: number | null;
};

type InvoiceLine = {
  id: string;
  purchase_invoice_id: string;
  product_id?: string | null;
  item_name_snapshot?: string | null;
  pack_unit?: number | null;
  btl_qty?: number | null;
  ctn_qty?: number | null;
  btl_gross_bill?: number | null;
  btl_gross_value?: number | null;
  price_ex?: number | null;
  pre_tax?: number | null;
  tax_amount?: number | null;
  price_tax_inc?: number | null;
  tax_inc_value?: number | null;
  empties_value?: number | null;
  row_no?: number | null;
};

type EditLine = {
  key: string;
  product_id: string | null;
  item_code: string;
  item_name: string;
  pack_unit: string;
  bottle_cost: string;
  plastic_cost: string;
  returnable: boolean;
  btl_qty: string;
  ctn_qty: string;
  btl_gross_bill: string;
  btl_gross_value: string;
  price_ex: string;
  tax_rate: string;
  pre_tax: string;
  tax_amount: string;
  price_tax_inc: string;
  tax_inc_value: string;
  empties_value: string;
};

function toNum(v: string | number | null | undefined) {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmt2(v: number) {
  return Number(v).toFixed(2);
}

function fmt4(v: number) {
  return Number(v).toFixed(4);
}

function fmt6(v: number) {
  return Number(v).toFixed(6);
}

function fmtComma(value: string | number | null | undefined, fixed = 2) {
  return toNum(value).toLocaleString(undefined, {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  });
}

function fmtCommaInput(value: string | number | null | undefined, fixed = 2) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  });
}

function ctnFromBtl(btlQty: string | number, packUnit: string | number) {
  const pack = toNum(packUnit);
  if (pack <= 0) return "";
  return fmt4(toNum(btlQty) / pack);
}

function blankLine(key: string): EditLine {
  return {
    key,
    product_id: null,
    item_code: "",
    item_name: "",
    pack_unit: "",
    bottle_cost: "",
    plastic_cost: "",
    returnable: false,
    btl_qty: "",
    ctn_qty: "",
    btl_gross_bill: "",
    btl_gross_value: "",
    price_ex: "",
    tax_rate: "",
    pre_tax: "",
    tax_amount: "",
    price_tax_inc: "",
    tax_inc_value: "",
    empties_value: "",
  };
}

function isLineEmpty(line: EditLine) {
  return (
    !line.product_id &&
    !line.item_code.trim() &&
    !line.item_name.trim() &&
    toNum(line.btl_qty) === 0 &&
    toNum(line.ctn_qty) === 0 &&
    toNum(line.price_tax_inc) === 0
  );
}

function computeDerived(line: EditLine): EditLine {
  const pack = toNum(line.pack_unit);
  const btlQty = toNum(line.btl_qty);
  const hasManualCtn = String(line.ctn_qty ?? "").replace(/,/g, "").trim().length > 0;
  const ctnQtyRaw = toNum(line.ctn_qty);
  const ctnQty = hasManualCtn ? ctnQtyRaw : pack > 0 ? btlQty / pack : 0;
  const priceTaxInc = toNum(line.price_tax_inc);
  const taxRate = toNum(line.tax_rate);
  const divisor = 1 + taxRate / 100;
  const priceEx = divisor > 0 ? priceTaxInc / divisor : priceTaxInc;
  const btlGrossBill = toNum(line.btl_gross_bill);
  const packBottleCost = toNum(line.bottle_cost);
  // bottle_cost is stored per pack in product master.
  // Brkges excludes crate value; convert to per-bottle by dividing total pack value by pack size.
  const btlGrossValue =
    pack > 0 ? ((priceTaxInc + packBottleCost) / pack) * btlGrossBill : 0;
  const preTax = ctnQty * priceEx;
  const taxAmount = ctnQty * (priceTaxInc - priceEx);
  const taxIncValue = ctnQty * priceTaxInc;
  const packCrateCost = toNum(line.plastic_cost);
  const emptiesValue = line.returnable ? ctnQty * (packBottleCost + packCrateCost) : 0;

  return {
    ...line,
    ctn_qty: hasManualCtn ? line.ctn_qty : ctnQty ? fmt4(ctnQty) : "",
    btl_gross_value: btlGrossValue ? fmt2(btlGrossValue) : "",
    price_ex: priceEx ? fmt6(priceEx) : "",
    tax_rate: String(line.tax_rate || "").trim() ? fmt2(taxRate) : "",
    pre_tax: preTax ? fmt2(preTax) : "",
    tax_amount: taxAmount ? fmt2(taxAmount) : "",
    tax_inc_value: taxIncValue ? fmt2(taxIncValue) : "",
    empties_value: emptiesValue ? fmt2(emptiesValue) : "",
  };
}

function suggestInvoiceNo(deliveryDate: string, invoices: Invoice[]) {
  const date = (deliveryDate || "").slice(0, 10);
  if (!date) return "";
  const prefix = `${date}-`;
  const seq = invoices.reduce((max, inv) => {
    const no = String(inv.invoice_no ?? "");
    if (!no.startsWith(prefix)) return max;
    const n = Number(no.slice(prefix.length)) || 0;
    return Math.max(max, n);
  }, 0);
  return `${prefix}${String(seq + 1).padStart(3, "0")}`;
}

function dateOrMin(value?: string | null) {
  return String(value ?? "0000-01-01");
}

function ProductStyleSearchBlobDialog({
  title,
  open,
  onOpenChange,
  items,
  onItemsChange,
  onSelect,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: string[];
  onItemsChange: (items: string[]) => void;
  onSelect: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      setShowNewForm(false);
      setShowEditForm(false);
      setNewValue("");
      setEditValue("");
    }
  }, [open]);

  const rowItems = useMemo(() => items.map((name, idx) => ({ id: String(idx), name })), [items]);
  const selectedItem = rowItems.find((x) => x.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rowItems;
    return rowItems.filter((v) => v.name.toLowerCase().includes(q));
  }, [rowItems, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      showGearIcon={false}
      contentClassName="max-w-lg text-sm"
    >
      <div className="space-y-3">
        {showNewForm ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const value = newValue.trim();
              if (!value) return;
              const exists = items.some((x) => x.toLowerCase() === value.toLowerCase());
              if (!exists) onItemsChange([...items, value]);
              onSelect(value);
              setShowNewForm(false);
              setNewValue("");
            }}
          >
            <div>
              <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
                Name *
              </label>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-white" style={{ backgroundColor: "var(--navbar)" }}>
                Save
              </Button>
            </div>
          </form>
        ) : showEditForm ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedItem) return;
              const value = editValue.trim();
              if (!value) return;
              const next = [...items];
              const selectedIndex = Number(selectedItem.id);
              if (selectedIndex < 0 || selectedIndex >= next.length) return;
              next[selectedIndex] = value;
              onItemsChange(Array.from(new Set(next)));
              onSelect(value);
              setShowEditForm(false);
            }}
          >
            <div>
              <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
                Name *
              </label>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEditForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-white" style={{ backgroundColor: "var(--navbar)" }}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search (F3)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
              />
              <Button size="sm" style={{ backgroundColor: "var(--navbar)" }} className="text-white">
                Search (F3)
              </Button>
            </div>
            <div className="max-h-64 overflow-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>
                      {title}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-center text-muted-foreground">No records. Click New (F2) to add one.</td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${selectedId === item.id ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => {
                          onSelect(item.name);
                          onOpenChange(false);
                        }}
                      >
                        <td className="px-2 py-2 font-medium">{item.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewForm(true)}
                style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New (F2)
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedItem}
                onClick={() => {
                  if (!selectedItem) return;
                  setEditValue(selectedItem.name);
                  setShowEditForm(true);
                }}
                style={selectedItem ? { color: "var(--navbar)", borderColor: "var(--navbar)" } : undefined}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedItem}
                onClick={() => {
                  if (!selectedItem) return;
                  onSelect(selectedItem.name);
                  onOpenChange(false);
                }}
              >
                Select
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function PurchaseInvoiceFormDialog({
  open,
  onOpenChange,
  onSaved,
  products,
  suppliers,
  locations,
  invoices,
  priceLists,
  priceListItems,
  initialInvoice,
  initialLines,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSaved: () => void;
  products: Product[];
  suppliers: Supplier[];
  locations: Location[];
  invoices: Invoice[];
  priceLists: PriceList[];
  priceListItems: PriceListItem[];
  initialInvoice: Invoice | null;
  initialLines: InvoiceLine[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [activeSupplierDropdown, setActiveSupplierDropdown] = useState(false);
  const [showTransporterSearch, setShowTransporterSearch] = useState(false);
  const [showDriverSearch, setShowDriverSearch] = useState(false);
  const [showVehicleSearch, setShowVehicleSearch] = useState(false);
  const [showTransporterDropdown, setShowTransporterDropdown] = useState(false);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([blankLine("0")]);
  const [lineDropdown, setLineDropdown] = useState<{ row: number; field: "code" | "name" } | null>(null);
  const [invoiceNoEdited, setInvoiceNoEdited] = useState(false);
  const [transporterLookupItems, setTransporterLookupItems] = useState<string[]>([]);
  const [driverLookupItems, setDriverLookupItems] = useState<string[]>([]);
  const [vehicleLookupItems, setVehicleLookupItems] = useState<string[]>([]);
  const supplierBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const transporterRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<HTMLDivElement>(null);

  const [id, setId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState<string>("");
  const [supplierInvNo, setSupplierInvNo] = useState<string>("");
  const [emptiesInvNo, setEmptiesInvNo] = useState<string>("");
  const [piNo, setPiNo] = useState<string>("");
  const [deliveryNoteNo, setDeliveryNoteNo] = useState<string>("");
  const [transporter, setTransporter] = useState<string>("");
  const [driverName, setDriverName] = useState<string>("");
  const [vehicleNo, setVehicleNo] = useState<string>("");
  const [printQty, setPrintQty] = useState<string>("1");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const seededLines =
      initialLines.length > 0
        ? initialLines
            .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
            .map((line, idx) => {
              const p = products.find((x) => String(x.id) === String(line.product_id ?? ""));
              return computeDerived({
                key: String(idx),
                product_id: line.product_id ? String(line.product_id) : null,
                item_code: p?.code ?? "",
                item_name: p?.name ?? line.item_name_snapshot ?? "",
                pack_unit: line.pack_unit ? fmt2(Number(line.pack_unit)) : "",
                bottle_cost: p?.bottle_cost != null ? fmt2(Number(p.bottle_cost)) : "",
                plastic_cost: p?.plastic_cost != null ? fmt2(Number(p.plastic_cost)) : "",
                returnable: Boolean(p?.returnable),
                btl_qty: line.btl_qty ? fmt2(Number(line.btl_qty)) : "",
                ctn_qty: line.ctn_qty ? fmt4(Number(line.ctn_qty)) : "",
                btl_gross_bill: line.btl_gross_bill ? fmt2(Number(line.btl_gross_bill)) : "",
                btl_gross_value: line.btl_gross_value ? fmt2(Number(line.btl_gross_value)) : "",
                price_ex: line.price_ex ? fmt6(Number(line.price_ex)) : "",
                tax_rate:
                  Number(line.price_ex ?? 0) > 0
                    ? fmt2(
                        ((Number(line.price_tax_inc ?? 0) / Number(line.price_ex ?? 0)) - 1) * 100
                      )
                    : "0.00",
                pre_tax: line.pre_tax ? fmt2(Number(line.pre_tax)) : "",
                tax_amount: line.tax_amount ? fmt2(Number(line.tax_amount)) : "",
                price_tax_inc: line.price_tax_inc ? fmt2(Number(line.price_tax_inc)) : "",
                tax_inc_value: line.tax_inc_value ? fmt2(Number(line.tax_inc_value)) : "",
                empties_value: line.empties_value ? fmt2(Number(line.empties_value)) : "",
              });
            })
        : [];

    setLines([...seededLines, blankLine(String(seededLines.length))]);

    if (initialInvoice) {
      setId(initialInvoice.id);
      setSupplierId(initialInvoice.supplier_id ?? "");
      setLocationId(initialInvoice.location_id ?? "");
      setInvoiceDate(initialInvoice.invoice_date ?? new Date().toISOString().slice(0, 10));
      setDeliveryDate(initialInvoice.delivery_date ?? "");
      setDueDate(initialInvoice.due_date ?? "");
      setPaymentDate(initialInvoice.payment_date ?? "");
      setInvoiceNo(initialInvoice.invoice_no ?? "");
      setSupplierInvNo(initialInvoice.supplier_inv_no ?? "");
      setEmptiesInvNo(initialInvoice.empties_inv_no ?? "");
      setPiNo(initialInvoice.pi_no ?? "");
      setDeliveryNoteNo(initialInvoice.delivery_note_no ?? "");
      setTransporter(initialInvoice.transporter ?? "");
      setDriverName(initialInvoice.driver_name ?? "");
      setVehicleNo(initialInvoice.vehicle_no ?? "");
      setPrintQty(initialInvoice.print_qty ?? "1");
      setNotes(initialInvoice.notes ?? "");
      setInvoiceNoEdited(true);
      const supplier = suppliers.find((x) => x.id === (initialInvoice.supplier_id ?? ""));
      setSupplierQuery(supplier?.name ?? "");
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const firstSupplier = suppliers[0];
      setId("");
      setSupplierId(firstSupplier?.id ?? "");
      setLocationId(locations[0]?.id ?? "");
      setInvoiceDate(today);
      setDeliveryDate(today);
      setDueDate(today);
      setPaymentDate(today);
      setInvoiceNo(suggestInvoiceNo(today, invoices));
      setSupplierInvNo("");
      setEmptiesInvNo("");
      setPiNo("");
      setDeliveryNoteNo("");
      setTransporter("");
      setDriverName("");
      setVehicleNo("");
      setPrintQty("1");
      setNotes("");
      setInvoiceNoEdited(false);
      setSupplierQuery(firstSupplier?.name ?? "");
    }

    setMessage(null);
  }, [open, initialInvoice, initialLines, products, suppliers, locations, invoices]);

  useEffect(() => {
    if (!open || id || invoiceNoEdited) return;
    const sourceDate = (deliveryDate || "").slice(0, 10);
    if (!sourceDate) {
      setInvoiceNo("");
      return;
    }
    setInvoiceNo(suggestInvoiceNo(sourceDate, invoices));
  }, [open, id, invoiceNoEdited, deliveryDate, invoices]);

  useEffect(() => {
    if (!open || !supplierId || !invoiceDate) return;
    const supplier = suppliers.find((s) => s.id === supplierId);
    const days = Number(supplier?.payment_terms ?? 0);
    if (days <= 0) return;
    const d = new Date(`${invoiceDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    const nextDue = d.toISOString().slice(0, 10);
    if (!dueDate || dueDate !== nextDue) setDueDate(nextDue);
  }, [open, supplierId, suppliers, invoiceDate, dueDate]);

  const transporterOptions = useMemo(
    () =>
      Array.from(
        new Set(invoices.map((x) => String(x.transporter ?? "").trim()).filter(Boolean))
      ).slice(0, 30),
    [invoices]
  );
  const driverOptions = useMemo(
    () => Array.from(new Set(invoices.map((x) => String(x.driver_name ?? "").trim()).filter(Boolean))).slice(0, 30),
    [invoices]
  );
  const vehicleOptions = useMemo(
    () => Array.from(new Set(invoices.map((x) => String(x.vehicle_no ?? "").trim()).filter(Boolean))).slice(0, 30),
    [invoices]
  );
  const filteredTransporterOptions = useMemo(
    () => transporterLookupItems.filter((v) => v.toLowerCase().includes(transporter.toLowerCase().trim())),
    [transporterLookupItems, transporter]
  );
  const filteredDriverOptions = useMemo(
    () => driverLookupItems.filter((v) => v.toLowerCase().includes(driverName.toLowerCase().trim())),
    [driverLookupItems, driverName]
  );
  const filteredVehicleOptions = useMemo(
    () => vehicleLookupItems.filter((v) => v.toLowerCase().includes(vehicleNo.toLowerCase().trim())),
    [vehicleLookupItems, vehicleNo]
  );

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 20);
    return suppliers
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [suppliers, supplierQuery]);

  const productLookup = useMemo(() => {
    const byCode = new Map<string, Product>();
    const byName = new Map<string, Product>();
    for (const p of products) {
      if (p.code) byCode.set(String(p.code).toLowerCase().trim(), p);
      byName.set(p.name.toLowerCase().trim(), p);
    }
    return { byCode, byName };
  }, [products]);

  const normalizedPriceLists = useMemo(
    () =>
      (priceLists ?? [])
        .filter((pl) => pl.is_active !== false)
        .map((pl) => {
          const typeName = String(pl.price_types?.name ?? "").toLowerCase().trim();
          const typeCode = String(pl.price_types?.code ?? "").toLowerCase().trim();
          const isCostType =
            typeName.includes("cost") ||
            typeCode.includes("cost") ||
            typeCode === "cp";
          return { ...pl, isCostType };
        })
        .sort((a, b) =>
          dateOrMin(b.effective_date).localeCompare(dateOrMin(a.effective_date))
        ),
    [priceLists]
  );

  const priceItemByListAndProduct = useMemo(() => {
    const map = new Map<string, PriceListItem>();
    for (const item of priceListItems ?? []) {
      map.set(`${item.price_list_id}|${String(item.product_id)}`, item);
    }
    return map;
  }, [priceListItems]);

  function getPriceForProductOnDate(
    productId: string,
    onDate: string
  ): { priceTaxInc: number; taxRate: number } | null {
    if (!productId || !onDate) return null;
    const inRangeLists = normalizedPriceLists.filter((pl) => {
      const eff = dateOrMin(pl.effective_date);
      const exp = pl.expiry_date ? String(pl.expiry_date) : "";
      if (eff > onDate) return false;
      if (exp && exp < onDate) return false;
      return true;
    });

    // Prefer cost-type price lists for purchase invoices.
    const preferredLists = inRangeLists.some((pl) => pl.isCostType)
      ? inRangeLists.filter((pl) => pl.isCostType)
      : inRangeLists;

    for (const pl of preferredLists) {
      const eff = dateOrMin(pl.effective_date);
      const exp = pl.expiry_date ? String(pl.expiry_date) : "";
      if (eff > onDate) continue;
      if (exp && exp < onDate) continue;
      const item = priceItemByListAndProduct.get(`${pl.id}|${productId}`);
      if (item) {
        return {
          priceTaxInc: toNum(item.price),
          taxRate: toNum(item.tax_rate),
        };
      }
    }
    return null;
  }

  useEffect(() => {
    if (!open) return;
    setTransporterLookupItems(transporterOptions);
    setDriverLookupItems(driverOptions);
    setVehicleLookupItems(vehicleOptions);
  }, [open, transporterOptions, driverOptions, vehicleOptions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (transporterRef.current && !transporterRef.current.contains(target)) setShowTransporterDropdown(false);
      if (driverRef.current && !driverRef.current.contains(target)) setShowDriverDropdown(false);
      if (vehicleRef.current && !vehicleRef.current.contains(target)) setShowVehicleDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totals = useMemo(() => {
    const active = lines.filter((l) => !isLineEmpty(l));
    const qty = active.reduce((s, l) => s + toNum(l.ctn_qty), 0);
    const brkgesValue = active.reduce((s, l) => s + toNum(l.btl_gross_value), 0);
    const sub = active.reduce((s, l) => s + toNum(l.pre_tax), 0);
    const tax = active.reduce((s, l) => s + toNum(l.tax_amount), 0);
    const grand = active.reduce((s, l) => s + toNum(l.tax_inc_value), 0);
    const empties = active.reduce((s, l) => s + toNum(l.empties_value), 0);
    return {
      qty: fmt4(qty),
      brkges: fmt2(brkgesValue),
      sub: fmt2(sub),
      tax: fmt2(tax),
      grand: fmt2(grand),
      empties: fmt2(empties),
    };
  }, [lines]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(String(p.id), p);
    return m;
  }, [products]);

  /** Read-only summary from line items: only returnables, grouped by empties type. */
  const emptiesTableRows = useMemo(() => {
    const grouped = new Map<string, { emptiesType: string; ctnQty: number; emptiesValue: number }>();
    for (const line of lines) {
      if (isLineEmpty(line) || !line.returnable) continue;
      const p = line.product_id ? productById.get(String(line.product_id)) : undefined;
      const emptiesType = String(p?.empties_type ?? "").trim() || "—";
      const curr = grouped.get(emptiesType) ?? { emptiesType, ctnQty: 0, emptiesValue: 0 };
      curr.ctnQty += toNum(line.ctn_qty);
      curr.emptiesValue += toNum(line.empties_value);
      grouped.set(emptiesType, curr);
    }
    return Array.from(grouped.values());
  }, [lines, productById]);

  const hasReturnables = useMemo(
    () =>
      lines.some((line) => {
        if (isLineEmpty(line)) return false;
        if (!line.product_id) return false;
        const p = productById.get(String(line.product_id));
        return Boolean(p?.returnable);
      }),
    [lines, productById]
  );

  useEffect(() => {
    if (!open || !hasReturnables) return;
    const raw = supplierInvNo.trim();
    if (!raw || !/^\d+$/.test(raw)) return;
    const next = String(Number(raw) + 1).padStart(raw.length, "0");
    setEmptiesInvNo(next);
  }, [open, supplierInvNo, hasReturnables]);

  function ensureTrailingBlank(next: EditLine[]) {
    const list = [...next];
    if (list.length === 0 || !isLineEmpty(list[list.length - 1])) {
      list.push(blankLine(String(list.length)));
    }
    return list.map((line, idx) => ({ ...line, key: String(idx) }));
  }

  function applyProductToLine(line: EditLine, product: Product) {
    const matched = getPriceForProductOnDate(String(product.id), invoiceDate);
    const next = computeDerived({
      ...line,
      product_id: String(product.id),
      item_code: String(product.code ?? ""),
      item_name: String(product.name ?? ""),
      pack_unit: product.pack_unit != null ? fmt2(Number(product.pack_unit)) : line.pack_unit,
      bottle_cost: product.bottle_cost != null ? fmt2(Number(product.bottle_cost)) : line.bottle_cost,
      plastic_cost: product.plastic_cost != null ? fmt2(Number(product.plastic_cost)) : line.plastic_cost,
      returnable: Boolean(product.returnable),
      price_tax_inc: matched ? fmt2(matched.priceTaxInc) : line.price_tax_inc,
      tax_rate: matched ? fmt2(matched.taxRate) : line.tax_rate || "0.00",
    });
    return next;
  }

  function updateLine(rowKey: string, patch: Partial<EditLine>) {
    setLines((prev) => {
      const updated = prev.map((line) =>
        line.key === rowKey ? computeDerived({ ...line, ...patch }) : line
      );
      return ensureTrailingBlank(updated);
    });
  }

  function refreshAllLinePrices(nextInvoiceDate: string) {
    setLines((prev) =>
      ensureTrailingBlank(
        prev.map((line) => {
          if (!line.product_id) return computeDerived(line);
          const matched = getPriceForProductOnDate(String(line.product_id), nextInvoiceDate);
          if (!matched) return computeDerived(line);
          return computeDerived({
            ...line,
            price_tax_inc: fmt2(matched.priceTaxInc),
            tax_rate: fmt2(matched.taxRate),
          });
        })
      )
    );
  }

  /** Same resolve behavior as sales invoice (exact code / exact name on blur). */
  function resolveProduct(idx: number, value: string, by: "code" | "name") {
    const product =
      by === "code"
        ? productLookup.byCode.get(value.toLowerCase().trim())
        : productLookup.byName.get(value.toLowerCase().trim());
    if (!product) return;
    setLines((prev) => {
      const line = prev[idx];
      if (!line) return prev;
      return ensureTrailingBlank(
        prev.map((l, i) => (i === idx ? applyProductToLine(l, product) : l))
      );
    });
  }

  function applyProductToRow(idx: number, product: Product) {
    setLines((prev) => {
      const line = prev[idx];
      if (!line) return prev;
      return ensureTrailingBlank(
        prev.map((l, i) => (i === idx ? applyProductToLine(l, product) : l))
      );
    });
    setLineDropdown(null);
  }

  function removeLine(rowKey: string) {
    setLines((prev) => ensureTrailingBlank(prev.filter((line) => line.key !== rowKey)));
  }

  async function submitFormData(formData: FormData, keepOpen: boolean) {
    setMessage(null);
    if (!supplierId) {
      setMessage("Supplier is required.");
      return;
    }
    if (!locationId) {
      setMessage("Location is required.");
      return;
    }
    startTransition(async () => {
      const result = await savePurchaseInvoice(formData);
      if (result?.error) {
        setMessage(result.error);
        return;
      }
      setMessage("Purchase invoice saved.");
      onSaved();
      if (!keepOpen) {
        onOpenChange(false);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const firstSupplier = suppliers[0];
        setId("");
        setSupplierId(firstSupplier?.id ?? "");
        setSupplierQuery(firstSupplier?.name ?? "");
        setLocationId(locations[0]?.id ?? "");
        setInvoiceDate(today);
        setDeliveryDate(today);
        setDueDate(today);
        setPaymentDate(today);
        setInvoiceNoEdited(false);
        setInvoiceNo(suggestInvoiceNo(today, invoices));
        setSupplierInvNo("");
        setEmptiesInvNo("");
        setPiNo("");
        setDeliveryNoteNo("");
        setTransporter("");
        setDriverName("");
        setVehicleNo("");
        setPrintQty("1");
        setNotes("");
        setLines([blankLine("0")]);
      }
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>, keepOpen: boolean) {
    e.preventDefault();
    await submitFormData(new FormData(e.currentTarget), keepOpen);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={id ? "Edit Purchase Invoice" : "New Purchase Invoice"}
      showGearIcon={false}
      contentClassName="max-w-[1220px]"
      bodyClassName="max-h-[86vh] overflow-y-auto p-3"
    >
      <form ref={formRef} onSubmit={(e) => handleSubmit(e, false)} className="space-y-3 text-sm">
        <input type="hidden" name="id" value={id} />

        <div className="rounded-md border border-border bg-muted/20 p-3">
          <div className="grid grid-cols-12 gap-x-4 gap-y-2 [&_input]:text-sm [&_select]:text-sm">
            <div className="col-span-4 space-y-1.5">
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Supplier</label>
                <div className="relative">
                  <input
                    value={supplierQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSupplierQuery(v);
                      setActiveSupplierDropdown(true);
                      if (!v.trim()) setSupplierId("");
                    }}
                    onFocus={() => {
                      if (supplierBlurTimer.current) clearTimeout(supplierBlurTimer.current);
                      setActiveSupplierDropdown(true);
                    }}
                    onBlur={() => {
                      supplierBlurTimer.current = setTimeout(() => setActiveSupplierDropdown(false), 120);
                    }}
                    className="h-6 w-full rounded-sm border border-input bg-background px-2"
                    placeholder="Search supplier..."
                    required
                  />
                  <input type="hidden" name="supplier_id" value={supplierId} />
                  {activeSupplierDropdown && filteredSuppliers.length > 0 && (
                    <div className="absolute z-40 mt-1 max-h-44 w-full overflow-auto rounded-sm border border-border bg-background shadow-lg">
                      {filteredSuppliers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="block w-full border-b border-border px-2 py-1 text-left text-[11px] last:border-0 hover:bg-muted/60"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setSupplierId(s.id);
                            setSupplierQuery(s.name);
                            setActiveSupplierDropdown(false);
                            const days = Number(s.payment_terms ?? 0);
                            if (days > 0 && invoiceDate) {
                              const d = new Date(`${invoiceDate}T00:00:00`);
                              d.setDate(d.getDate() + days);
                              setDueDate(d.toISOString().slice(0, 10));
                            }
                          }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Location-In</label>
                <select
                  name="location_id"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                  required
                >
                  <option value="">-- Select location --</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {(loc.code ? `${loc.code} - ` : "") + loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Due Date</label>
                <input
                  type="date"
                  name="due_date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Payment Date</label>
                <input
                  type="date"
                  name="payment_date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Pallet Qty.</label>
                <input
                  name="print_qty"
                  value={printQty}
                  onChange={(e) => setPrintQty(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                />
              </div>
            </div>

            <div className="col-span-4 space-y-1.5">
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Invoice Date</label>
                <input
                  type="date"
                  name="invoice_date"
                  value={invoiceDate}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setInvoiceDate(nextDate);
                    refreshAllLinePrices(nextDate);
                  }}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                  required
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Delivery Date</label>
                <input
                  type="date"
                  name="delivery_date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Transporter</label>
                <div className="relative flex items-center gap-1" ref={transporterRef}>
                  <input
                    name="transporter"
                    value={transporter}
                    onChange={(e) => {
                      setTransporter(e.target.value);
                      setShowTransporterDropdown(true);
                    }}
                    onFocus={() => setShowTransporterDropdown(true)}
                    className="h-6 w-full rounded-sm border border-input bg-background px-2"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTransporterSearch(true)}
                    className="inline-flex h-6 w-7 items-center justify-center rounded-sm border border-input bg-muted/50 hover:bg-muted"
                    aria-label="Manage transporter"
                  >
                    <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
                  </button>
                  {showTransporterDropdown && filteredTransporterOptions.length > 0 && (
                    <div className="absolute left-0 right-8 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                      {filteredTransporterOptions.slice(0, 30).map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTransporter(item);
                            setShowTransporterDropdown(false);
                            (transporterRef.current?.querySelector("input") as HTMLInputElement)?.blur();
                          }}
                        >
                          <span className="font-medium">{item}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Driver's Name</label>
                <div className="relative flex items-center gap-1" ref={driverRef}>
                  <input
                    name="driver_name"
                    value={driverName}
                    onChange={(e) => {
                      setDriverName(e.target.value);
                      setShowDriverDropdown(true);
                    }}
                    onFocus={() => setShowDriverDropdown(true)}
                    className="h-6 w-full rounded-sm border border-input bg-background px-2"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDriverSearch(true)}
                    className="inline-flex h-6 w-7 items-center justify-center rounded-sm border border-input bg-muted/50 hover:bg-muted"
                    aria-label="Manage driver"
                  >
                    <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
                  </button>
                  {showDriverDropdown && filteredDriverOptions.length > 0 && (
                    <div className="absolute left-0 right-8 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                      {filteredDriverOptions.slice(0, 30).map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setDriverName(item);
                            setShowDriverDropdown(false);
                            (driverRef.current?.querySelector("input") as HTMLInputElement)?.blur();
                          }}
                        >
                          <span className="font-medium">{item}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Vehicle No.</label>
                <div className="relative flex items-center gap-1" ref={vehicleRef}>
                  <input
                    name="vehicle_no"
                    value={vehicleNo}
                    onChange={(e) => {
                      setVehicleNo(e.target.value);
                      setShowVehicleDropdown(true);
                    }}
                    onFocus={() => setShowVehicleDropdown(true)}
                    className="h-6 w-full rounded-sm border border-input bg-background px-2"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVehicleSearch(true)}
                    className="inline-flex h-6 w-7 items-center justify-center rounded-sm border border-input bg-muted/50 hover:bg-muted"
                    aria-label="Manage vehicle"
                  >
                    <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
                  </button>
                  {showVehicleDropdown && filteredVehicleOptions.length > 0 && (
                    <div className="absolute left-0 right-8 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                      {filteredVehicleOptions.slice(0, 30).map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setVehicleNo(item);
                            setShowVehicleDropdown(false);
                            (vehicleRef.current?.querySelector("input") as HTMLInputElement)?.blur();
                          }}
                        >
                          <span className="font-medium">{item}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-span-4 space-y-1.5">
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Invoice No.</label>
                <input
                  name="invoice_no"
                  value={invoiceNo}
                  onChange={(e) => {
                    setInvoiceNoEdited(true);
                    setInvoiceNo(e.target.value);
                  }}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                  placeholder="Auto-generated from delivery date"
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Supplier Inv No.</label>
                <input
                  name="supplier_inv_no"
                  value={supplierInvNo}
                  onChange={(e) => setSupplierInvNo(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                  placeholder="10 digits"
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Empties Inv No.</label>
                <input
                  name="empties_inv_no"
                  value={emptiesInvNo}
                  onChange={(e) => setEmptiesInvNo(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                  placeholder="Auto (Supplier Inv No. + 1) when ret."
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">PO Number</label>
                <input
                  name="pi_no"
                  value={piNo}
                  onChange={(e) => setPiNo(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                />
              </div>
              <div className="grid grid-cols-[92px,1fr] items-center gap-1.5">
                <label className="font-semibold text-[var(--navbar)]">Delivery Note</label>
                <input
                  name="delivery_note_no"
                  value={deliveryNoteNo}
                  onChange={(e) => setDeliveryNoteNo(e.target.value)}
                  className="h-6 rounded-sm border border-input bg-background px-2"
                />
              </div>
            </div>

            <div className="col-span-12 grid grid-cols-[92px,1fr] items-start gap-1.5 pt-0.5">
              <label className="pt-1 font-semibold text-[var(--navbar)]">Notes</label>
              <textarea
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[40px] rounded-sm border border-input bg-background px-2 py-1.5"
              />
            </div>
          </div>
        </div>

        <div className="rounded border border-border">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                  <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 34 }}>#</th>
                  <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 80 }}>Item Code</th>
                  <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 150 }}>Item Name</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 70 }}>Pack Unit</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 64 }}>Btl Qty</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 108 }}>Ctn Qty</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 70 }}>Brkges (Btl)</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 70 }}>Brkges Value</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 96 }}>Price (Ex-Tax)</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 92 }}>Pre Tax</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 70 }}>Tax Amt</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 96 }}>Price (Tax-Inc)</th>
                  <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 96 }}>Tax Inc Value</th>
                  <th className="border-b border-border px-1 py-1 text-center" style={{ width: 52 }}>Del</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const pid = String(line.product_id ?? "");
                  const codeMatches = products.filter((p) =>
                    `${p.code ?? ""}`.toLowerCase().includes(line.item_code.toLowerCase().trim()) ||
                    p.name.toLowerCase().includes(line.item_code.toLowerCase().trim())
                  );
                  const nameMatches = products.filter((p) =>
                    p.name.toLowerCase().includes(line.item_name.toLowerCase().trim()) ||
                    `${p.code ?? ""}`.toLowerCase().includes(line.item_name.toLowerCase().trim())
                  );
                  return (
                    <tr
                      key={line.key}
                      className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}
                    >
                      <td className="border-b border-r border-border px-1 py-1 text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <div className="relative">
                          <input type="hidden" name={`line_product_id_${idx}`} value={pid} />
                          <input type="hidden" name={`line_item_name_${idx}`} value={line.item_name ?? ""} />
                          <input
                            type="hidden"
                            name={`line_empties_value_${idx}`}
                            value={String(line.empties_value ?? "").replace(/,/g, "") || "0"}
                          />
                          <input
                            id={`item-code-${idx}`}
                            value={line.item_code}
                            onChange={(e) => {
                              updateLine(line.key, { item_code: e.target.value });
                              setLineDropdown({ row: idx, field: "code" });
                            }}
                            onFocus={() => setLineDropdown({ row: idx, field: "code" })}
                            onBlur={(e) => {
                              resolveProduct(idx, e.target.value, "code");
                              setTimeout(() => {
                                setLineDropdown((prev) =>
                                  prev && prev.row === idx && prev.field === "code" ? null : prev
                                );
                              }, 120);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (codeMatches.length > 0) applyProductToRow(idx, codeMatches[0]);
                                const ctnInput = document.getElementById(`ctn-qty-${idx}`) as HTMLInputElement | null;
                                ctnInput?.focus();
                                ctnInput?.select();
                              }
                            }}
                            className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-xs outline-none focus:bg-background"
                            autoComplete="off"
                          />
                          {lineDropdown?.row === idx && lineDropdown.field === "code" && codeMatches.length > 0 && (
                            <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[22rem] overflow-auto rounded border border-border bg-background shadow-xl">
                              {codeMatches.slice(0, 20).map((p) => (
                                <button
                                  key={String(p.id)}
                                  type="button"
                                  className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => applyProductToRow(idx, p)}
                                >
                                  {(p.code ? `${p.code} - ` : "") + p.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <div className="relative">
                          <input
                            id={`item-name-${idx}`}
                            value={line.item_name}
                            onChange={(e) => {
                              updateLine(line.key, { item_name: e.target.value });
                              setLineDropdown({ row: idx, field: "name" });
                            }}
                            onFocus={() => setLineDropdown({ row: idx, field: "name" })}
                            onBlur={(e) => {
                              resolveProduct(idx, e.target.value, "name");
                              setTimeout(() => {
                                setLineDropdown((prev) =>
                                  prev && prev.row === idx && prev.field === "name" ? null : prev
                                );
                              }, 120);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (nameMatches.length > 0) applyProductToRow(idx, nameMatches[0]);
                                const ctnInput = document.getElementById(`ctn-qty-${idx}`) as HTMLInputElement | null;
                                ctnInput?.focus();
                                ctnInput?.select();
                              }
                            }}
                            className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-xs outline-none focus:bg-background"
                            autoComplete="off"
                          />
                          {lineDropdown?.row === idx && lineDropdown.field === "name" && nameMatches.length > 0 && (
                            <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[26rem] overflow-auto rounded border border-border bg-background shadow-xl">
                              {nameMatches.slice(0, 20).map((p) => (
                                <button
                                  key={String(p.id)}
                                  type="button"
                                  className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => applyProductToRow(idx, p)}
                                >
                                  {(p.code ? `${p.code} - ` : "") + p.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_pack_unit_${idx}`}
                          value={line.pack_unit}
                          onChange={(e) => {
                            const nextPack = e.target.value;
                            updateLine(line.key, {
                              pack_unit: nextPack,
                              ctn_qty: ctnFromBtl(line.btl_qty, nextPack) || line.ctn_qty,
                            });
                          }}
                          onBlur={(e) => {
                            const nextPack = fmtCommaInput(e.target.value, 2);
                            updateLine(line.key, {
                              pack_unit: nextPack,
                              ctn_qty: ctnFromBtl(line.btl_qty, nextPack) || line.ctn_qty,
                            });
                          }}
                          className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_btl_qty_${idx}`}
                          value={line.btl_qty}
                          onChange={(e) => {
                            const nextBtl = e.target.value;
                            updateLine(line.key, {
                              btl_qty: nextBtl,
                              ctn_qty: ctnFromBtl(nextBtl, line.pack_unit) || line.ctn_qty,
                            });
                          }}
                          onBlur={(e) => {
                            const nextBtl = fmtCommaInput(e.target.value, 2);
                            updateLine(line.key, {
                              btl_qty: nextBtl,
                              ctn_qty: ctnFromBtl(nextBtl, line.pack_unit) || line.ctn_qty,
                            });
                          }}
                          className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          id={`ctn-qty-${idx}`}
                          name={`line_ctn_qty_${idx}`}
                          value={line.ctn_qty}
                          onChange={(e) => updateLine(line.key, { ctn_qty: e.target.value })}
                          onBlur={(e) => updateLine(line.key, { ctn_qty: fmtCommaInput(e.target.value, 4) })}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const nextItemInput = document.getElementById(`item-code-${idx + 1}`) as HTMLInputElement | null;
                            nextItemInput?.focus();
                            nextItemInput?.select();
                          }}
                          className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_btl_gross_bill_${idx}`}
                          value={line.btl_gross_bill}
                          onChange={(e) => updateLine(line.key, { btl_gross_bill: e.target.value })}
                          onBlur={(e) => updateLine(line.key, { btl_gross_bill: fmtCommaInput(e.target.value, 2) })}
                          className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_btl_gross_value_${idx}`}
                          value={line.btl_gross_value}
                          readOnly
                          className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_price_ex_${idx}`}
                          value={fmtComma(line.price_ex, 6)}
                          readOnly
                          className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_pre_tax_${idx}`}
                          value={fmtComma(line.pre_tax, 2)}
                          readOnly
                          className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_tax_amount_${idx}`}
                          value={fmtComma(line.tax_amount, 2)}
                          readOnly
                          className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_price_tax_inc_${idx}`}
                          value={line.price_tax_inc}
                          onChange={(e) => updateLine(line.key, { price_tax_inc: e.target.value })}
                          onBlur={(e) => updateLine(line.key, { price_tax_inc: fmtCommaInput(e.target.value, 2) || e.target.value })}
                          className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                        />
                      </td>
                      <td className="border-b border-r border-border px-1 py-0.5">
                        <input
                          name={`line_tax_inc_value_${idx}`}
                          value={fmtComma(line.tax_inc_value, 2)}
                          readOnly
                          className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right"
                        />
                      </td>
                      <td className="border-b border-border px-1 py-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-input bg-background hover:bg-muted disabled:opacity-50"
                          aria-label="Delete line"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td colSpan={4} className="border-t border-r border-border px-2 py-1 text-right" />
                  <td colSpan={2} className="border-t border-r border-border px-2 py-1 text-right">
                    {fmtComma(
                      lines.reduce((s, l) => s + (isLineEmpty(l) ? 0 : toNum(l.ctn_qty)), 0),
                      2
                    )}
                  </td>
                  <td className="border-t border-r border-border px-2 py-1 text-right">-</td>
                  <td className="border-t border-r border-border px-2 py-1 text-right">
                    {fmtComma(totals.brkges, 2)}
                  </td>
                  <td className="border-t border-r border-border px-2 py-1 text-right">-</td>
                  <td className="border-t border-r border-border px-2 py-1 text-right">
                    {fmtComma(totals.sub, 2)}
                  </td>
                  <td className="border-t border-r border-border px-2 py-1 text-right">
                    {fmtComma(totals.tax, 2)}
                  </td>
                  <td className="border-t border-r border-border px-2 py-1 text-right">-</td>
                  <td className="border-t border-r border-border px-2 py-1 text-right">
                    {fmtComma(totals.grand, 2)}
                  </td>
                  <td className="border-t border-border px-2 py-1" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex justify-start border-t border-border bg-muted/10 px-2 py-2">
            <table className="w-auto min-w-[28rem] table-fixed border border-border text-xs">
              <thead>
                <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-left font-medium"
                    style={{ color: "var(--navbar)", width: "14rem" }}
                  >
                    Empties Type
                  </th>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-right font-medium"
                    style={{ color: "var(--navbar)", width: "7rem" }}
                  >
                    Ctn Qty
                  </th>
                  <th
                    className="border-b border-border px-2 py-1.5 text-right font-medium"
                    style={{ color: "var(--navbar)", width: "9rem" }}
                  >
                    Empties Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {emptiesTableRows.length === 0 ? (
                  <tr className="bg-background">
                    <td
                      colSpan={3}
                      className="border-b border-border px-2 py-2 text-center text-muted-foreground"
                    >
                      No returnable line items to show.
                    </td>
                  </tr>
                ) : (
                  emptiesTableRows.map((row, i) => {
                    return (
                      <tr
                        key={`empties-${row.emptiesType}-${i}`}
                        className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                      >
                        <td className="border-b border-r border-border px-2 py-1.5">
                          {row.emptiesType}
                        </td>
                        <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums">
                          {row.ctnQty ? fmtComma(row.ctnQty, 4) : "—"}
                        </td>
                        <td className="border-b border-border px-2 py-1.5 text-right tabular-nums">
                          {fmtComma(row.emptiesValue || 0, 2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {emptiesTableRows.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/30 font-semibold">
                    <td className="border-t border-r border-border px-2 py-1 text-right" />
                    <td className="border-t border-r border-border px-2 py-1 text-right tabular-nums">
                      {fmtComma(
                        emptiesTableRows.reduce((s, r) => s + r.ctnQty, 0),
                        2
                      )}
                    </td>
                    <td className="border-t border-border px-2 py-1 text-right tabular-nums">
                      {fmtComma(
                        emptiesTableRows.reduce((s, r) => s + r.emptiesValue, 0),
                        2
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {message && (
          <div className="rounded border border-border bg-muted/30 px-3 py-1.5 text-xs">
            {message}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={isPending}
              className="h-7 rounded-sm text-white"
              style={{ backgroundColor: "var(--navbar)" }}
            >
              Save
            </Button>
            <Button
              type="button"
              disabled={isPending}
              className="h-7 rounded-sm text-white"
              style={{ backgroundColor: "var(--navbar)" }}
              onClick={() => {
                if (!formRef.current) return;
                submitFormData(new FormData(formRef.current), true);
              }}
            >
              Save &amp; New
            </Button>
            <Button type="button" variant="outline" disabled className="h-7 rounded-sm">
              Print
            </Button>
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-7 rounded-sm">
            Cancel
          </Button>
        </div>
      </form>

      <ProductStyleSearchBlobDialog
        title="Transporter Search"
        open={showTransporterSearch}
        onOpenChange={setShowTransporterSearch}
        items={transporterLookupItems}
        onItemsChange={setTransporterLookupItems}
        onSelect={setTransporter}
      />
      <ProductStyleSearchBlobDialog
        title="Driver Name Search"
        open={showDriverSearch}
        onOpenChange={setShowDriverSearch}
        items={driverLookupItems}
        onItemsChange={setDriverLookupItems}
        onSelect={setDriverName}
      />
      <ProductStyleSearchBlobDialog
        title="Vehicle No Search"
        open={showVehicleSearch}
        onOpenChange={setShowVehicleSearch}
        items={vehicleLookupItems}
        onItemsChange={setVehicleLookupItems}
        onSelect={setVehicleNo}
      />
    </Dialog>
  );
}
