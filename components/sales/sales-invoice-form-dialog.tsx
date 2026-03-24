"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  getSuggestedInvoiceNo,
  saveSalesInvoice,
} from "@/app/dashboard/sales/sales-invoices/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-7 w-full rounded border border-input bg-background px-2 text-xs";

type Product = {
  id: string | number;
  code?: string | null;
  name: string;
  pack_unit?: number | null;
  empties_type?: string | null;
  bottle_cost?: number | null;
  plastic_cost?: number | null;
  returnable?: boolean | null;
};

type Customer = {
  id: string;
  tax_id?: string | null;
  name: string;
  payment_terms?: number | null;
  sales_rep_id?: string | null;
  price_type?: string | null;
  location_id?: string | null;
};

type SalesRep = { id: string; code?: string | null; name: string };
type Location = { id: string; code?: string | null; name: string };
type PriceType = { id: string; code?: string | null; name: string };
type PriceList = {
  id: string;
  price_type_id: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  is_active?: boolean | null;
  price_types?: { name?: string | null } | null;
};
type PriceListItem = {
  price_list_id: string;
  product_id: string | number;
  price?: number | null;
  tax_rate?: number | null;
  vat_type?: string | null;
};
type Promotion = {
  id: string;
  promo_code: string;
  name: string;
  promo_budget_cartons?: number | null;
  consumed_cartons?: number | null;
  start_date: string;
  end_date: string;
  is_active?: boolean | null;
  eligible_price_types?: string[] | null;
  eligible_location_ids?: string[] | null;
  days_of_week?: number[] | null;
  happy_hour_start?: string | null;
  happy_hour_end?: string | null;
};
type PromotionRule = {
  promotion_id: string;
  buy_product_id: string | number;
  buy_qty?: number | null;
  buy_unit?: string | null;
  reward_product_id: string | number;
  reward_qty?: number | null;
  reward_unit?: string | null;
  row_no?: number | null;
};

type SalesOrder = {
  id: string;
  order_no: string;
  customer_id?: string | null;
  sales_rep_id?: string | null;
  location_id?: string | null;
  order_date: string;
  delivery_date?: string | null;
  notes?: string | null;
};

type SalesOrderLine = {
  id: string;
  sales_order_id: string;
  product_id?: string | null;
  item_name_snapshot?: string | null;
  price_type?: string | null;
  pack_unit?: number | null;
  qty?: number | null;
  cl_qty?: number | null;
  price_ex?: number | null;
  price_tax_inc?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  value_tax_inc?: number | null;
  row_no?: number | null;
};

type LoadOutSheet = {
  id: string;
  sheet_no: string;
  sales_rep_id?: string | null;
  location_id?: string | null;
  sales_date: string;
  vehicle_no?: string | null;
  driver_name?: string | null;
  customer_id?: string | null;
};

type LoadOutSheetLine = {
  id: string;
  load_out_sheet_id: string;
  product_id?: string | null;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  van_sales_qty?: number | null;
  unit_price?: number | null;
  sales_value?: number | null;
  row_no?: number | null;
};

type Invoice = {
  id: string;
  invoice_no: string;
  customer_id?: string | null;
  sales_rep_id?: string | null;
  location_id?: string | null;
  invoice_date: string;
  delivery_date?: string | null;
  vat_invoice_no?: string | null;
  driver_name?: string | null;
  vehicle_no?: string | null;
  payment_terms?: string | null;
  type_status?: string | null;
  notes?: string | null;
  balance_os?: number | null;
};

type InvoiceLine = {
  id: string;
  sales_invoice_id: string;
  product_id?: string | null;
  item_name_snapshot?: string | null;
  price_type?: string | null;
  pack_unit?: number | null;
  qty?: number | null;
  cl_qty?: number | null;
  free_qty?: number | null;
  price_ex?: number | null;
  price_tax_inc?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  value_tax_inc?: number | null;
  row_no?: number | null;
};

type LineMode = "invoice" | "sales_order" | "van_sales";

type EditLine = {
  key: string;
  product_id: string;
  item_code: string;
  item_name: string;
  price_type: string;
  pack_unit: string;
  qty: string;
  cl_qty: string;
  price_ex: string;
  pre_tax: string;
  price_tax_inc: string;
  tax_rate: string;
  tax_amount: string;
  value_tax_inc: string;
};

function n(v: string | number | null | undefined) {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  const num = Number(raw || 0);
  return Number.isFinite(num) ? num : 0;
}

function fmt(value: number, fixed = 2) {
  return Number(value || 0).toFixed(fixed);
}

function fmtComma(value: string | number | null | undefined, fixed = 2) {
  return n(value).toLocaleString(undefined, {
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

function dateOrMin(value?: string | null) {
  return String(value ?? "0000-01-01");
}

function blankLine(key: string, defaultPriceType = ""): EditLine {
  return {
    key,
    product_id: "",
    item_code: "",
    item_name: "",
    price_type: defaultPriceType,
    pack_unit: "",
    qty: "",
    cl_qty: "",
    price_ex: "",
    pre_tax: "",
    price_tax_inc: "",
    tax_rate: "",
    tax_amount: "",
    value_tax_inc: "",
  };
}

function hasLineData(line: EditLine) {
  return Boolean(line.product_id || line.item_name || n(line.qty) > 0 || n(line.cl_qty) > 0 || n(line.price_tax_inc) > 0);
}

function isLineCompletelyEmpty(line: EditLine) {
  return (
    !String(line.product_id || "").trim() &&
    !String(line.item_code || "").trim() &&
    !String(line.item_name || "").trim() &&
    !String(line.pack_unit || "").replace(/,/g, "").trim() &&
    !String(line.qty || "").replace(/,/g, "").trim() &&
    !String(line.cl_qty || "").replace(/,/g, "").trim() &&
    !String(line.price_tax_inc || "").replace(/,/g, "").trim() &&
    !String(line.tax_rate || "").replace(/,/g, "").trim()
  );
}

function isPromoLine(line: EditLine) {
  return String(line.item_name || "").startsWith("[PROMO]");
}

function parseTimeMinutes(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const bits = raw.split(":");
  if (bits.length < 2) return null;
  const h = Number(bits[0]);
  const m = Number(bits[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
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

  const rowItems = useMemo(
    () => items.map((name, idx) => ({ id: String(idx), name })),
    [items]
  );

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
              if (!exists) {
                onItemsChange([...items, value]);
              }
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
                      <td className="px-2 py-4 text-center text-muted-foreground">
                        No records. Click New (F2) to add one.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${
                          selectedId === item.id ? "bg-muted/50" : ""
                        }`}
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

export function SalesInvoiceFormDialog({
  open,
  onOpenChange,
  onSaved,
  products = [],
  customers = [],
  salesReps = [],
  locations = [],
  priceTypes = [],
  priceLists = [],
  priceListItems = [],
  promotions = [],
  promotionRules = [],
  invoices = [],
  salesOrders = [],
  salesOrderLines = [],
  loadOutSheets = [],
  loadOutSheetLines = [],
  initialInvoice = null,
  initialLines = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  products?: Product[];
  customers?: Customer[];
  salesReps?: SalesRep[];
  locations?: Location[];
  priceTypes?: PriceType[];
  priceLists?: PriceList[];
  priceListItems?: PriceListItem[];
  promotions?: Promotion[];
  promotionRules?: PromotionRule[];
  invoices?: Invoice[];
  salesOrders?: SalesOrder[];
  salesOrderLines?: SalesOrderLine[];
  loadOutSheets?: LoadOutSheet[];
  loadOutSheetLines?: LoadOutSheetLine[];
  initialInvoice?: Invoice | null;
  initialLines?: InvoiceLine[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceNoTouched, setInvoiceNoTouched] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [vatInvoiceNo, setVatInvoiceNo] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [lineMode, setLineMode] = useState<LineMode>("invoice");
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState<string>("");
  const [selectedLoadOutSheetId, setSelectedLoadOutSheetId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [customerBalanceOs, setCustomerBalanceOs] = useState("0.00");
  const [defaultPriceType, setDefaultPriceType] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [showDriverSearch, setShowDriverSearch] = useState(false);
  const [showVehicleSearch, setShowVehicleSearch] = useState(false);
  const [driverLookupItems, setDriverLookupItems] = useState<string[]>([]);
  const [vehicleLookupItems, setVehicleLookupItems] = useState<string[]>([]);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [lineDropdown, setLineDropdown] = useState<{ row: number; field: "code" | "name" } | null>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<HTMLDivElement>(null);
  const invoiceNoReqRef = useRef(0);

  const productLookup = useMemo(() => {
    const byId = new Map<string, Product>();
    const byCode = new Map<string, Product>();
    const byName = new Map<string, Product>();
    for (const p of products) {
      const id = String(p.id);
      byId.set(id, p);
      if (p.code) byCode.set(p.code.toLowerCase(), p);
      byName.set(p.name.toLowerCase(), p);
    }
    return { byId, byCode, byName };
  }, [products]);
  const priceTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const pt of priceTypes) map.set(pt.id, pt.name);
    return map;
  }, [priceTypes]);

  const normalizedPriceLists = useMemo(() => {
    return (priceLists ?? [])
      .filter((pl) => pl.is_active !== false)
      .map((pl) => ({
        ...pl,
        priceTypeName: String(pl.price_types?.name ?? priceTypeNameById.get(pl.price_type_id) ?? "")
          .trim()
          .toLowerCase(),
      }));
  }, [priceLists, priceTypeNameById]);

  const priceItemByListAndProduct = useMemo(() => {
    const map = new Map<string, PriceListItem>();
    for (const item of priceListItems ?? []) {
      map.set(`${item.price_list_id}|${String(item.product_id)}`, item);
    }
    return map;
  }, [priceListItems]);

  const customerLastLocation = useMemo(() => {
    const map = new Map<string, string>();
    const sorted = [...invoices].sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)));
    for (const inv of sorted) {
      if (!inv.customer_id || !inv.location_id || map.has(inv.customer_id)) continue;
      map.set(inv.customer_id, inv.location_id);
    }
    return map;
  }, [invoices]);

  const driverOptions = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .map((i) => String(i.driver_name ?? "").trim())
            .filter(Boolean)
        )
      ),
    [invoices]
  );
  const vehicleOptions = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .map((i) => String(i.vehicle_no ?? "").trim())
            .filter(Boolean)
        )
      ),
    [invoices]
  );
  const filteredDriverOptions = useMemo(
    () =>
      driverLookupItems.filter((v) =>
        v.toLowerCase().includes(driverName.toLowerCase().trim())
      ),
    [driverLookupItems, driverName]
  );
  const filteredVehicleOptions = useMemo(
    () =>
      vehicleLookupItems.filter((v) =>
        v.toLowerCase().includes(vehicleNo.toLowerCase().trim())
      ),
    [vehicleLookupItems, vehicleNo]
  );
  const filteredCustomers = useMemo(() => {
    const q = customerQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => {
      const label = `${c.tax_id ? `${c.tax_id} - ` : ""}${c.name}`.toLowerCase();
      return label.includes(q);
    });
  }, [customers, customerQuery]);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) map.set(String(c.id), c);
    return map;
  }, [customers]);

  const filteredSalesOrders = useMemo(() => {
    if (!customerId) return salesOrders;
    return salesOrders.filter((o) => String(o.customer_id ?? "") === String(customerId));
  }, [salesOrders, customerId]);

  const filteredLoadOutSheets = useMemo(() => {
    if (!salesRepId) return loadOutSheets;
    return loadOutSheets.filter((s) => String(s.sales_rep_id ?? "") === String(salesRepId));
  }, [loadOutSheets, salesRepId]);

  const linesReadOnly = lineMode === "van_sales" && Boolean(selectedLoadOutSheetId);

  const rulesByPromotionId = useMemo(() => {
    const map = new Map<string, PromotionRule[]>();
    for (const rule of promotionRules) {
      const key = String(rule.promotion_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rule);
    }
    return map;
  }, [promotionRules]);

  function toCartons(qty: number, unit: string | null | undefined, product: Product | undefined) {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    if (String(unit ?? "cartons").toLowerCase() !== "bottles") return qty;
    const pack = n(product?.pack_unit);
    if (pack <= 0) return 0;
    return qty / pack;
  }

  function timeNowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function promoEligible(
    promo: Promotion,
    invoiceDateValue: string,
    customerPriceType: string,
    selectedLocationId: string
  ) {
    if (promo.is_active === false) return false;
    const start = String(promo.start_date ?? "");
    const end = String(promo.end_date ?? "");
    if (start && invoiceDateValue < start) return false;
    if (end && invoiceDateValue > end) return false;

    const allowedPriceTypes = (promo.eligible_price_types ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    if (allowedPriceTypes.length > 0 && !allowedPriceTypes.includes(customerPriceType.trim().toLowerCase())) return false;

    const allowedLocations = (promo.eligible_location_ids ?? []).map((x) => String(x));
    if (allowedLocations.length > 0 && !allowedLocations.includes(String(selectedLocationId))) return false;

    const days = (promo.days_of_week ?? []).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (days.length > 0) {
      const invoiceDay = new Date(`${invoiceDateValue}T00:00:00`).getDay();
      if (!days.includes(invoiceDay)) return false;
    }

    const hhStart = parseTimeMinutes(promo.happy_hour_start);
    const hhEnd = parseTimeMinutes(promo.happy_hour_end);
    if (hhStart != null && hhEnd != null) {
      const nowMin = timeNowMinutes();
      if (hhStart <= hhEnd) {
        if (nowMin < hhStart || nowMin > hhEnd) return false;
      } else {
        const inRange = nowMin >= hhStart || nowMin <= hhEnd;
        if (!inRange) return false;
      }
    }

    return true;
  }

  function buildLinesWithPromotions(baseLines: EditLine[]) {
    const dateForPromo = deliveryDate || invoiceDate;
    if (!dateForPromo || !customerId) return [...baseLines];
    const customer = customerById.get(String(customerId));
    const customerPriceType = String(customer?.price_type ?? "").trim();
    const selectedLocation = String(locationId || "");

    const eligiblePromotions = promotions.filter((promo) =>
      promoEligible(promo, dateForPromo, customerPriceType, selectedLocation)
    );
    const remainingBudgetByPromo = new Map<string, number>();
    for (const promo of eligiblePromotions) {
      const budget =
        promo.promo_budget_cartons == null
          ? Number.POSITIVE_INFINITY
          : n(promo.promo_budget_cartons) - n(promo.consumed_cartons);
      remainingBudgetByPromo.set(
        String(promo.id),
        Number.isFinite(budget) ? Math.max(0, budget) : Number.POSITIVE_INFINITY
      );
    }

    const generated: EditLine[] = [];
    for (let rowIndex = 0; rowIndex < baseLines.length; rowIndex += 1) {
      const row = baseLines[rowIndex];
      generated.push(row);
      if (!row.product_id || !hasLineData(row)) continue;

      for (const promo of eligiblePromotions) {
        const promoRulesForPromo = [...(rulesByPromotionId.get(String(promo.id)) ?? [])]
          .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
          .filter((rule) => String(rule.buy_product_id) === String(row.product_id));

        if (promoRulesForPromo.length === 0) continue;

        for (const rule of promoRulesForPromo) {
          const rewardProductId = String(rule.reward_product_id);
          const rewardProduct = productLookup.byId.get(rewardProductId);
          if (!rewardProduct) continue;

          const buyUnit = String(rule.buy_unit ?? "cartons").toLowerCase() === "bottles" ? "bottles" : "cartons";
          const rewardUnit = String(rule.reward_unit ?? "cartons").toLowerCase() === "bottles" ? "bottles" : "cartons";
          const buyQtyThreshold = n(rule.buy_qty);
          if (buyQtyThreshold <= 0) continue;

          const sourceQty = buyUnit === "bottles" ? n(row.qty) : n(row.cl_qty);
          const triggerCount = Math.floor(sourceQty / buyQtyThreshold);
          if (triggerCount <= 0) continue;

          const rewardQtyRaw = triggerCount * n(rule.reward_qty);
          if (rewardQtyRaw <= 0) continue;

          const rewardQtyCartons = toCartons(rewardQtyRaw, rewardUnit, rewardProduct);
          if (rewardQtyCartons <= 0) continue;

          const promoBudgetLeft = remainingBudgetByPromo.get(String(promo.id)) ?? Number.POSITIVE_INFINITY;
          let finalCartons = rewardQtyCartons;
          if (Number.isFinite(promoBudgetLeft)) {
            finalCartons = Math.min(finalCartons, Math.max(0, promoBudgetLeft));
            remainingBudgetByPromo.set(String(promo.id), promoBudgetLeft - finalCartons);
          }
          if (finalCartons <= 0) continue;

          const rewardPack = n(rewardProduct.pack_unit);
          const rewardBottles =
            rewardUnit === "bottles" ? rewardQtyRaw : rewardPack > 0 ? finalCartons * rewardPack : 0;
          const code = String(rewardProduct.code ?? "").trim();

          generated.push({
            key: `promo-${rowIndex}-${promo.id}-${String(rule.row_no ?? 0)}-${rewardProductId}`,
            product_id: rewardProductId,
            item_code: code,
            item_name: `[PROMO] ${promo.promo_code} - ${rewardProduct.name}`,
            price_type: "",
            pack_unit: rewardPack > 0 ? fmt(rewardPack, 2) : "",
            qty: rewardBottles > 0 ? fmt(rewardBottles, 2) : "",
            cl_qty: fmt(finalCartons, 4),
            price_ex: fmt(0, 6),
            pre_tax: fmt(0, 2),
            price_tax_inc: fmt(0, 2),
            tax_rate: "",
            tax_amount: fmt(0, 2),
            value_tax_inc: fmt(0, 2),
          });
        }
      }
    }

    return generated;
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLineMode("invoice");
    setSelectedSalesOrderId("");
    setSelectedLoadOutSheetId("");
    setInvoiceNo(initialInvoice?.invoice_no ?? "");
    setInvoiceNoTouched(Boolean(initialInvoice?.id || initialInvoice?.invoice_no));
    setCustomerId(initialInvoice?.customer_id ?? "");
    const initialCustomer = customers.find((c) => c.id === (initialInvoice?.customer_id ?? ""));
    setCustomerQuery(initialCustomer ? `${initialCustomer.tax_id ? `${initialCustomer.tax_id} - ` : ""}${initialCustomer.name}` : "");
    setSalesRepId(initialInvoice?.sales_rep_id ?? "");
    setLocationId(initialInvoice?.location_id ?? "");
    setInvoiceDate(initialInvoice?.invoice_date ?? new Date().toISOString().slice(0, 10));
    setDeliveryDate(initialInvoice?.delivery_date ?? "");
    setVatInvoiceNo(initialInvoice?.vat_invoice_no ?? "");
    setPaymentTerms(initialInvoice?.payment_terms ?? "");
    setDriverName(initialInvoice?.driver_name ?? "");
    setVehicleNo(initialInvoice?.vehicle_no ?? "");
    setNotes(initialInvoice?.notes ?? "");
    setDriverLookupItems(driverOptions);
    setVehicleLookupItems(vehicleOptions);

    const seeded = (initialLines ?? [])
      .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
      .map((line, i) => {
        const product = line.product_id ? productLookup.byId.get(String(line.product_id)) : null;
        const seededLine = {
          key: String(i),
          product_id: String(line.product_id ?? ""),
          item_code: product?.code ?? "",
          item_name: line.item_name_snapshot ?? product?.name ?? "",
          price_type: line.price_type ?? "",
          pack_unit: fmt(n(line.pack_unit), 2),
          qty: fmt(n(line.qty), 2),
          cl_qty: fmt(n(line.cl_qty), 4),
          // Recompute precision-safe values from tax-inc + tax rate on load.
          // Persisted DB value may be rounded to 2dp, but invoice math uses 6dp for price_ex.
          price_ex: fmt(n(line.price_ex), 6),
          pre_tax: fmt(n(line.price_ex) * n(line.cl_qty), 2),
          price_tax_inc: fmt(n(line.price_tax_inc), 2),
          tax_rate: fmt(n(line.tax_rate), 3),
          tax_amount: fmt(n(line.tax_amount), 2),
          value_tax_inc: fmt(n(line.value_tax_inc), 2),
        } satisfies EditLine;
        return computeDerived(seededLine);
      });

    if (seeded.length === 0) setLines([blankLine("0"), blankLine("1"), blankLine("2")]);
    else setLines([...seeded, blankLine(String(seeded.length))]);
  }, [open, initialInvoice, initialLines, productLookup.byId, driverOptions, vehicleOptions, customers]);

  useEffect(() => {
    if (!open) return;
    if (initialInvoice?.id) return;
    if (invoiceNoTouched) return;
    const datePrefix = String(deliveryDate || "").slice(0, 10);
    if (!datePrefix) {
      setInvoiceNo("");
      return;
    }

    const requestId = invoiceNoReqRef.current + 1;
    invoiceNoReqRef.current = requestId;
    const timer = setTimeout(async () => {
      const res = await getSuggestedInvoiceNo(datePrefix);
      if (invoiceNoReqRef.current !== requestId) return;
      if (res?.ok && res.invoiceNo) setInvoiceNo(res.invoiceNo);
    }, 180);

    return () => clearTimeout(timer);
  }, [open, initialInvoice?.id, deliveryDate, invoiceNoTouched]);

  useEffect(() => {
    if (!customerId) {
      setCustomerBalanceOs("0.00");
      return;
    }
    const outstanding = invoices
      .filter((inv) => inv.customer_id === customerId && inv.id !== initialInvoice?.id)
      .reduce((sum, inv) => sum + Number(inv.balance_os ?? 0), 0);
    setCustomerBalanceOs(fmt(outstanding, 2));
  }, [customerId, invoices, initialInvoice?.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (customerRef.current && !customerRef.current.contains(target)) setShowCustomerDropdown(false);
      if (driverRef.current && !driverRef.current.contains(target)) setShowDriverDropdown(false);
      if (vehicleRef.current && !vehicleRef.current.contains(target)) setShowVehicleDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isPosted = false;

  useEffect(() => {
    if (!open || isPosted) return;
    if (lineMode === "van_sales") return;
    setLines((prev) => {
      const nonPromo = prev.filter((line) => !isPromoLine(line));
      const workingRows = nonPromo.filter((line) => !isLineCompletelyEmpty(line));
      const withPromos = buildLinesWithPromotions(workingRows);
      const rekeyed = withPromos.map((line, idx) => ({ ...line, key: String(idx) }));
      const next = [...rekeyed, blankLine(String(rekeyed.length), defaultPriceType)];

      const normalize = (arr: EditLine[]) =>
        arr.map((line) => ({
          product_id: line.product_id,
          item_code: line.item_code,
          item_name: line.item_name,
          price_type: line.price_type,
          pack_unit: line.pack_unit,
          qty: line.qty,
          cl_qty: line.cl_qty,
          price_ex: line.price_ex,
          pre_tax: line.pre_tax,
          price_tax_inc: line.price_tax_inc,
          tax_rate: line.tax_rate,
          tax_amount: line.tax_amount,
          value_tax_inc: line.value_tax_inc,
        }));

      if (JSON.stringify(normalize(prev)) === JSON.stringify(normalize(next))) return prev;
      return next;
    });
  }, [
    open,
    isPosted,
    lineMode,
    lines,
    customerId,
    locationId,
    invoiceDate,
    deliveryDate,
    promotions,
    rulesByPromotionId,
    customerById,
    productLookup.byId,
    defaultPriceType,
  ]);

  function getEffectivePriceForLine(productId: string, linePriceType: string, onDate: string) {
    const priceTypeKey = linePriceType.trim().toLowerCase();
    if (!productId || !priceTypeKey || !onDate) return null;

    const candidates = normalizedPriceLists
      .filter((pl) => {
        if (pl.priceTypeName !== priceTypeKey) return false;
        const eff = dateOrMin(pl.effective_date);
        const exp = pl.expiry_date ? String(pl.expiry_date) : "";
        if (eff > onDate) return false;
        if (exp && exp < onDate) return false;
        return true;
      })
      .sort((a, b) => dateOrMin(b.effective_date).localeCompare(dateOrMin(a.effective_date)));

    for (const pl of candidates) {
      const item = priceItemByListAndProduct.get(`${pl.id}|${productId}`);
      if (item) return item;
    }
    return null;
  }

  function computeDerived(merged: EditLine): EditLine {
    const noSelectedItem = !String(merged.product_id || "").trim() && !String(merged.item_name || "").trim();
    const noNumericInput =
      !String(merged.qty || "").replace(/,/g, "").trim() &&
      !String(merged.cl_qty || "").replace(/,/g, "").trim() &&
      !String(merged.price_tax_inc || "").replace(/,/g, "").trim();

    if (noSelectedItem && noNumericInput) {
      return {
        ...merged,
        price_ex: "",
        pre_tax: "",
        tax_amount: "",
        value_tax_inc: "",
      };
    }

    const taxRate = n(merged.tax_rate);
    const priceTaxInc = n(merged.price_tax_inc);
    const qtyTotal = n(merged.cl_qty);
    const divisor = 1 + taxRate / 100;
    const priceEx = divisor > 0 ? priceTaxInc / divisor : priceTaxInc;
    const preTax = priceEx * qtyTotal;
    const taxAmount = (priceTaxInc - priceEx) * qtyTotal;
    const valueTaxInc = priceTaxInc * qtyTotal;
    return {
      ...merged,
      price_ex: fmt(priceEx, 6),
      pre_tax: fmt(preTax, 2),
      tax_rate: String(merged.tax_rate || "").trim() ? fmt(taxRate, 3) : "",
      tax_amount: fmt(taxAmount, 2),
      value_tax_inc: fmt(valueTaxInc, 2),
    };
  }

  function ctnFromBtl(btlQty: string | number, packUnit: string | number) {
    const pack = n(packUnit);
    if (pack <= 0) return "";
    return fmt(n(btlQty) / pack, 4);
  }

  function refreshAllLinePrices(nextInvoiceDate: string, nextDefaultPriceType?: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (!line.product_id) return computeDerived(line);
        const effectivePriceType = line.price_type || nextDefaultPriceType || defaultPriceType;
        if (!effectivePriceType) return computeDerived(line);
        const matched = getEffectivePriceForLine(line.product_id, effectivePriceType, nextInvoiceDate);
        if (!matched) return computeDerived(line);
        return computeDerived({
          ...line,
          price_type: effectivePriceType,
          price_tax_inc: fmt(n(matched.price), 2),
          tax_rate: fmt(n(matched.tax_rate), 3),
        });
      })
    );
  }

  const totals = useMemo(() => {
    let qty = 0;
    let sub = 0;
    let tax = 0;
    let grand = 0;
    for (const line of lines) {
      const q = n(line.cl_qty);
      qty += q;
      sub += n(line.price_ex) * q;
      tax += n(line.tax_amount);
      grand += n(line.value_tax_inc);
    }
    return {
      qty: fmt(qty, 2),
      sub: fmt(sub, 2),
      tax: fmt(tax, 2),
      grand: fmt(grand, 2),
    };
  }, [lines]);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(String(p.id), p);
    return map;
  }, [products]);

  const emptiesTableRows = useMemo(() => {
    const grouped = new Map<string, { emptiesType: string; ctnQty: number; emptiesValue: number }>();
    for (const line of lines) {
      if (!String(line.product_id || "").trim()) continue;
      const ctnQty = n(line.cl_qty);
      if (ctnQty <= 0) continue;
      const product = productById.get(String(line.product_id));
      if (!product || product.returnable !== true) continue;
      const emptiesType = String(product.empties_type ?? "").trim() || "—";
      const perCartonReturnable = n(product.bottle_cost) + n(product.plastic_cost);
      const value = ctnQty * perCartonReturnable;
      const curr = grouped.get(emptiesType) ?? { emptiesType, ctnQty: 0, emptiesValue: 0 };
      curr.ctnQty += ctnQty;
      curr.emptiesValue += value;
      grouped.set(emptiesType, curr);
    }
    return Array.from(grouped.values());
  }, [lines, productById]);

  function updateLine(index: number, patch: Partial<EditLine>) {
    if (linesReadOnly) return;
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const merged = computeDerived({ ...current, ...patch });

      next[index] = merged;
      const last = next[next.length - 1];
      if (last && hasLineData(last)) {
        next.push(blankLine(String(next.length), defaultPriceType));
      }
      return next;
    });
  }

  function deleteLine(index: number) {
    if (linesReadOnly) return;
    setLines((prev) => {
      if (prev.length <= 1) return [blankLine("0", defaultPriceType)];
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 || hasLineData(next[next.length - 1])) {
        next.push(blankLine(String(next.length), defaultPriceType));
      }
      return next;
    });
  }

  function applyCustomerDefaults(nextCustomerId: string) {
    const c = customers.find((x) => x.id === nextCustomerId);
    if (!c) return;
    if (c.sales_rep_id) setSalesRepId(c.sales_rep_id);
    const loc = c.location_id || customerLastLocation.get(c.id) || "";
    if (loc) setLocationId(loc);
    if (c.price_type) {
      setDefaultPriceType(c.price_type);
      setLines((prev) =>
        prev.map((line) =>
          !line.price_type ? { ...line, price_type: c.price_type! } : line
        )
      );
      refreshAllLinePrices(invoiceDate, c.price_type);
    }
    if (c.payment_terms != null) setPaymentTerms(String(c.payment_terms));
  }

  function selectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const selected = customers.find((c) => c.id === nextCustomerId);
    if (selected) {
      setCustomerQuery(`${selected.tax_id ? `${selected.tax_id} - ` : ""}${selected.name}`);
    }
    applyCustomerDefaults(nextCustomerId);
    setShowCustomerDropdown(false);
  }

  function applyProductToRow(index: number, product: Product) {
    const currentPriceType = lines[index]?.price_type || defaultPriceType;
    const effectivePrice = getEffectivePriceForLine(String(product.id), currentPriceType, invoiceDate);
    updateLine(index, {
      product_id: String(product.id),
      item_code: product.code ?? "",
      item_name: product.name,
      pack_unit: fmt(n(product.pack_unit), 2),
      price_type: currentPriceType,
      price_tax_inc: effectivePrice ? fmt(n(effectivePrice.price), 2) : lines[index]?.price_tax_inc || "",
      tax_rate: effectivePrice ? fmt(n(effectivePrice.tax_rate), 3) : lines[index]?.tax_rate || "0.000",
    });
    setLineDropdown(null);
  }

  function resolveProduct(index: number, value: string, by: "code" | "name") {
    const product =
      by === "code"
        ? productLookup.byCode.get(value.toLowerCase().trim())
        : productLookup.byName.get(value.toLowerCase().trim());
    if (!product) return;
    applyProductToRow(index, product);
  }

  async function submit(closeAfterSave: boolean) {
    setPending(true);
    setError(null);

    const fd = new FormData();
    if (initialInvoice?.id) fd.set("id", initialInvoice.id);
    if (invoiceNo) fd.set("invoice_no", invoiceNo);
    fd.set("customer_id", customerId);
    if (salesRepId) fd.set("sales_rep_id", salesRepId);
    if (locationId) fd.set("location_id", locationId);
    fd.set("invoice_date", invoiceDate);
    if (deliveryDate) fd.set("delivery_date", deliveryDate);
    if (vatInvoiceNo) fd.set("vat_invoice_no", vatInvoiceNo);
    if (paymentTerms) fd.set("payment_terms", paymentTerms);
    if (driverName) fd.set("driver_name", driverName);
    if (vehicleNo) fd.set("vehicle_no", vehicleNo);
    fd.set("line_mode", lineMode);
    if (notes) fd.set("notes", notes);

    let row = 0;
    for (const line of lines) {
      const hasData = line.product_id || line.item_name || n(line.qty) > 0 || n(line.cl_qty) > 0 || n(line.price_tax_inc) > 0;
      if (!hasData) continue;
      fd.set(`line_product_id_${row}`, line.product_id || "");
      fd.set(`line_item_name_${row}`, line.item_name || "");
      fd.set(`line_price_type_${row}`, line.price_type || defaultPriceType || "");
      fd.set(`line_pack_unit_${row}`, line.pack_unit || "0");
      fd.set(`line_qty_${row}`, line.qty || "0");
      fd.set(`line_cl_qty_${row}`, line.cl_qty || "0");
      fd.set(`line_free_qty_${row}`, "0");
      fd.set(`line_price_ex_${row}`, line.price_ex || "0");
      fd.set(`line_price_tax_inc_${row}`, line.price_tax_inc || "0");
      fd.set(`line_tax_rate_${row}`, line.tax_rate || "0");
      fd.set(`line_tax_amount_${row}`, line.tax_amount || "0");
      fd.set(`line_value_tax_inc_${row}`, line.value_tax_inc || "0");
      fd.set(`line_vat_type_${row}`, "inc");
      row += 1;
    }

    const result = await saveSalesInvoice(fd);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    onSaved();
    if (closeAfterSave) {
      onOpenChange(false);
      return;
    }

    setInvoiceNo("");
    setInvoiceNoTouched(false);
    setCustomerId("");
    setCustomerQuery("");
    setSalesRepId("");
    setLocationId("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDeliveryDate("");
    setVatInvoiceNo("");
    setPaymentTerms("");
    setDriverName("");
    setVehicleNo("");
    setLineMode("invoice");
    setNotes("");
    setCustomerBalanceOs("0.00");
    setDefaultPriceType("");
    setLines([blankLine("0"), blankLine("1"), blankLine("2")]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialInvoice?.id ? "Edit Sales Invoice" : "New Sales Invoice"}
      contentClassName="max-w-[1120px] text-sm"
      bodyClassName="max-h-none overflow-visible p-4"
    >
      <div className="space-y-2">
        {error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}

        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Customer</label>
            <div className="relative" ref={customerRef}>
              <input
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredCustomers.length > 0) {
                    e.preventDefault();
                    selectCustomer(filteredCustomers[0].id);
                  }
                }}
                className={inputClass}
                placeholder="Type to filter customer"
                autoComplete="off"
                disabled={isPosted}
              />
              {showCustomerDropdown && filteredCustomers.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                  {filteredCustomers.slice(0, 30).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectCustomer(c.id)}
                    >
                      {(c.tax_id ? `${c.tax_id} - ` : "") + c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Sales Rep</label>
            <select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)} className={inputClass} disabled={isPosted}>
              <option value="">-- Select rep --</option>
              {salesReps.map((s) => (
                <option key={s.id} value={s.id}>{(s.code ? `${s.code} - ` : "") + s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Location-Out</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass} disabled={isPosted}>
              <option value="">-- Select location --</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{(l.code ? `${l.code} - ` : "") + l.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Balance O/S</label>
            <input value={fmtComma(customerBalanceOs, 2)} className={inputClass} readOnly />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => {
                const nextDate = e.target.value;
                setInvoiceDate(nextDate);
                refreshAllLinePrices(nextDate);
              }}
              className={inputClass}
              disabled={isPosted}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Delivery Date</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} disabled={isPosted} />
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Invoice No</label>
            <input
              value={invoiceNo}
              onChange={(e) => {
                const next = e.target.value;
                setInvoiceNo(next);
                setInvoiceNoTouched(next.trim().length > 0);
              }}
              className={inputClass}
              placeholder="Auto-generated as yyyy-mm-dd-xxx"
              disabled={isPosted}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>VAT Invoice No</label>
            <input value={vatInvoiceNo} onChange={(e) => setVatInvoiceNo(e.target.value)} className={inputClass} disabled={isPosted} />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Driver&apos;s Name</label>
            <div className="relative flex gap-1" ref={driverRef}>
              <input
                value={driverName}
                onChange={(e) => {
                  setDriverName(e.target.value);
                  setShowDriverDropdown(true);
                }}
                onFocus={() => setShowDriverDropdown(true)}
                className={inputClass}
                autoComplete="off"
                disabled={isPosted}
              />
              <button
                type="button"
                onClick={() => setShowDriverSearch(true)}
                className="flex h-7 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                disabled={isPosted}
              >
                <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
              </button>
              {showDriverDropdown && filteredDriverOptions.length > 0 && (
                <div className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                  {filteredDriverOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
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

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Payment Terms</label>
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={inputClass} disabled={isPosted} />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Vehicle No</label>
            <div className="relative flex gap-1" ref={vehicleRef}>
              <input
                value={vehicleNo}
                onChange={(e) => {
                  setVehicleNo(e.target.value);
                  setShowVehicleDropdown(true);
                }}
                onFocus={() => setShowVehicleDropdown(true)}
                className={inputClass}
                autoComplete="off"
                disabled={isPosted}
              />
              <button
                type="button"
                onClick={() => setShowVehicleSearch(true)}
                className="flex h-7 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                disabled={isPosted}
              >
                <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
              </button>
              {showVehicleDropdown && filteredVehicleOptions.length > 0 && (
                <div className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                  {filteredVehicleOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
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

          <div className="col-span-3">
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} disabled={isPosted} />
          </div>
        </div>

        <div className="rounded border border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
          Saving invoice updates stock quantities and customer balance immediately.
        </div>

        <div className="flex items-center gap-1 border-b border-border text-xs">
          {([
            { id: "invoice", label: "Invoices" },
            { id: "sales_order", label: "Sales Order" },
            { id: "van_sales", label: "Van Sales" },
          ] as Array<{ id: LineMode; label: string }>).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (lineMode === tab.id) return;
                setLineMode(tab.id);
                setSelectedSalesOrderId("");
                setSelectedLoadOutSheetId("");
                setLines([blankLine("0", defaultPriceType), blankLine("1", defaultPriceType), blankLine("2", defaultPriceType)]);
              }}
              className={`rounded-t border border-b-0 px-3 py-1 ${
                lineMode === tab.id
                  ? "border-[var(--navbar)] bg-[var(--navbar)] text-white"
                  : "border-border bg-muted/20 text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {lineMode === "sales_order" && (
          <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/10 px-2 py-2">
            <span className="text-xs font-medium" style={{ color: "var(--navbar)" }}>Select sales order:</span>
            <select
              value={selectedSalesOrderId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedSalesOrderId(id);
                if (!id) {
                  setLines([blankLine("0", defaultPriceType), blankLine("1", defaultPriceType), blankLine("2", defaultPriceType)]);
                  return;
                }
                const order = salesOrders.find((o) => o.id === id);
                if (!order) return;
                setCustomerId(order.customer_id ?? "");
                const cust = customers.find((c) => c.id === order.customer_id);
                setCustomerQuery(cust ? `${cust.tax_id ? `${cust.tax_id} - ` : ""}${cust.name}` : "");
                setSalesRepId(order.sales_rep_id ?? "");
                setLocationId(order.location_id ?? "");
                setInvoiceDate(order.order_date ?? new Date().toISOString().slice(0, 10));
                setDeliveryDate(order.delivery_date ?? "");
                setNotes(order.notes ?? "");
                const orderLines = salesOrderLines
                  .filter((l) => l.sales_order_id === id)
                  .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0));
                const mapped = orderLines.map((l, i) => {
                  const prod = productLookup.byId.get(String(l.product_id ?? ""));
                  const el: EditLine = {
                    key: String(i),
                    product_id: String(l.product_id ?? ""),
                    item_code: prod?.code ?? "",
                    item_name: l.item_name_snapshot ?? prod?.name ?? "",
                    price_type: l.price_type ?? defaultPriceType,
                    pack_unit: fmt(n(l.pack_unit), 2),
                    qty: fmt(n(l.qty), 2),
                    cl_qty: fmt(n(l.cl_qty), 4),
                    price_ex: fmt(n(l.price_ex), 6),
                    pre_tax: fmt(n(l.price_ex) * n(l.cl_qty), 2),
                    price_tax_inc: fmt(n(l.price_tax_inc), 2),
                    tax_rate: fmt(n(l.tax_rate), 3),
                    tax_amount: fmt(n(l.tax_amount), 2),
                    value_tax_inc: fmt(n(l.value_tax_inc), 2),
                  };
                  return computeDerived(el);
                });
                setLines(mapped.length > 0 ? [...mapped, blankLine(String(mapped.length), defaultPriceType)] : [blankLine("0", defaultPriceType), blankLine("1", defaultPriceType), blankLine("2", defaultPriceType)]);
              }}
              className="h-7 rounded border border-input bg-background px-2 text-xs"
            >
              <option value="">— Select sales order —</option>
              {filteredSalesOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_no} ({o.order_date})
                </option>
              ))}
            </select>
            {customerId ? null : <span className="text-xs text-muted-foreground">Select a customer first to filter orders.</span>}
          </div>
        )}

        {lineMode === "van_sales" && (
          <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/10 px-2 py-2">
            <span className="text-xs font-medium" style={{ color: "var(--navbar)" }}>Select load out sheet:</span>
            <select
              value={selectedLoadOutSheetId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedLoadOutSheetId(id);
                if (!id) {
                  setLines([blankLine("0", defaultPriceType), blankLine("1", defaultPriceType), blankLine("2", defaultPriceType)]);
                  return;
                }
                const sheet = loadOutSheets.find((s) => s.id === id);
                if (!sheet) return;
                setSalesRepId(sheet.sales_rep_id ?? "");
                setLocationId(sheet.location_id ?? "");
                setInvoiceDate(sheet.sales_date ?? new Date().toISOString().slice(0, 10));
                setDriverName(sheet.driver_name ?? "");
                setVehicleNo(sheet.vehicle_no ?? "");
                setCustomerId(sheet.customer_id ?? "");
                const cust = customers.find((c) => c.id === sheet.customer_id);
                setCustomerQuery(cust ? `${cust.tax_id ? `${cust.tax_id} - ` : ""}${cust.name}` : "");
                if (cust?.price_type) setDefaultPriceType(cust.price_type);
                const sheetLines = loadOutSheetLines
                  .filter((l) => l.load_out_sheet_id === id && n(l.van_sales_qty) > 0)
                  .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0));
                const mapped = sheetLines.map((l, i) => {
                  const prod = productLookup.byId.get(String(l.product_id ?? ""));
                  const packUnit = n(prod?.pack_unit ?? 0) || 1;
                  const qtyVal = n(l.van_sales_qty);
                  const clQty = qtyVal;
                  const priceTaxInc = n(l.unit_price);
                  const valueTaxInc = n(l.sales_value);
                  const taxRate = 0;
                  const taxAmount = valueTaxInc - (valueTaxInc / (1 + taxRate / 100));
                  const el: EditLine = {
                    key: String(i),
                    product_id: String(l.product_id ?? ""),
                    item_code: l.product_code_snapshot ?? prod?.code ?? "",
                    item_name: l.product_name_snapshot ?? prod?.name ?? "",
                    price_type: defaultPriceType,
                    pack_unit: fmt(packUnit, 2),
                    qty: fmt(qtyVal * packUnit, 2),
                    cl_qty: fmt(clQty, 4),
                    price_ex: fmt(priceTaxInc / (1 + taxRate / 100), 6),
                    pre_tax: fmt((priceTaxInc / (1 + taxRate / 100)) * clQty, 2),
                    price_tax_inc: fmt(priceTaxInc, 2),
                    tax_rate: fmt(taxRate, 3),
                    tax_amount: fmt(taxAmount, 2),
                    value_tax_inc: fmt(valueTaxInc, 2),
                  };
                  return computeDerived(el);
                });
                setLines(mapped);
              }}
              className="h-7 rounded border border-input bg-background px-2 text-xs"
            >
              <option value="">— Select load out sheet —</option>
              {filteredLoadOutSheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sheet_no} ({s.sales_date})
                </option>
              ))}
            </select>
            {salesRepId ? null : <span className="text-xs text-muted-foreground">Select a sales rep (optional) to filter sheets.</span>}
            {linesReadOnly && <span className="text-xs text-amber-600">Van sales lines are read-only.</span>}
          </div>
        )}

        <div className="rounded border border-border">
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 34 }}>#</th>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 80 }}>Item Code</th>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 150 }}>Item Name</th>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 108 }}>Price Type</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 70 }}>Pack Unit</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 64 }}>Btl Qty</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 72 }}>Ctn Qty</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 96 }}>Price (Ex-Tax)</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 92 }}>Pre Tax</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 70 }}>Tax Amt</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 96 }}>Price (Tax-Inc)</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 96 }}>Value (Tax-Inc)</th>
                <th className="border-b border-border px-1 py-1 text-center" style={{ width: 52 }}>Del</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const promoRow = isPromoLine(line);
                return (
                <tr
                  key={line.key}
                  className={`${idx % 2 === 0 ? "bg-background" : "bg-muted/20"} ${
                    promoRow ? "bg-amber-100/60 ring-1 ring-inset ring-amber-300/60" : ""
                  }`}
                >
                  {/** per-row filtered options for type-to-filter + Enter selection */}
                  {(() => {
                    const codeQuery = line.item_code.toLowerCase().trim();
                    const nameQuery = line.item_name.toLowerCase().trim();
                    const codeMatches = products.filter((p) =>
                      `${p.code ?? ""}`.toLowerCase().includes(codeQuery) ||
                      p.name.toLowerCase().includes(codeQuery)
                    );
                    const nameMatches = products.filter((p) =>
                      p.name.toLowerCase().includes(nameQuery) ||
                      `${p.code ?? ""}`.toLowerCase().includes(nameQuery)
                    );
                    return (
                      <>
                  <td
                    className={`border-b border-r border-border px-1 py-1 text-muted-foreground ${
                      promoRow ? "border-l-4 border-l-amber-500 font-semibold text-amber-800" : ""
                    }`}
                  >
                    {promoRow ? "G" : idx + 1}
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <div className="relative">
                      <input
                        id={`item-code-${idx}`}
                        value={line.item_code}
                        onChange={(e) => {
                          updateLine(idx, { item_code: e.target.value });
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
                        className={`h-7 w-full rounded-none border-0 px-1 text-xs outline-none ${
                          promoRow ? "bg-amber-50/80 font-medium text-amber-900" : "bg-transparent focus:bg-background"
                        }`}
                        disabled={isPosted || promoRow || linesReadOnly}
                      />
                      {!promoRow && lineDropdown?.row === idx && lineDropdown.field === "code" && codeMatches.length > 0 && (
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
                          updateLine(idx, { item_name: e.target.value });
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
                        className={`h-7 w-full rounded-none border-0 px-1 text-xs outline-none ${
                          promoRow
                            ? "bg-amber-50/80 font-semibold text-amber-900"
                            : "bg-transparent focus:bg-background"
                        }`}
                        disabled={isPosted || promoRow || linesReadOnly}
                      />
                      {!promoRow && lineDropdown?.row === idx && lineDropdown.field === "name" && nameMatches.length > 0 && (
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
                    <select
                      value={line.price_type}
                      onChange={(e) => {
                        const nextPriceType = e.target.value;
                        const matched = line.product_id
                          ? getEffectivePriceForLine(line.product_id, nextPriceType, invoiceDate)
                          : null;
                        updateLine(idx, {
                          price_type: nextPriceType,
                          ...(matched
                            ? {
                                price_tax_inc: fmt(n(matched.price), 2),
                                tax_rate: fmt(n(matched.tax_rate), 3),
                              }
                            : {}),
                        });
                      }}
                      className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-xs outline-none focus:bg-background"
                      disabled={isPosted || promoRow || linesReadOnly}
                    >
                      <option value="">--</option>
                      {priceTypes.map((pt) => (
                        <option key={pt.id} value={pt.name}>{pt.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input
                      value={line.pack_unit}
                      onChange={(e) => {
                        const nextPack = e.target.value;
                        updateLine(idx, {
                          pack_unit: nextPack,
                          cl_qty: ctnFromBtl(line.qty, nextPack),
                        });
                      }}
                      onBlur={(e) => {
                        const nextPack = fmtCommaInput(e.target.value, 2);
                        updateLine(idx, {
                          pack_unit: nextPack,
                          cl_qty: ctnFromBtl(line.qty, nextPack),
                        });
                      }}
                      className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      disabled={isPosted || promoRow || linesReadOnly}
                    />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input
                      value={line.qty}
                      onChange={(e) => {
                        const nextBtl = e.target.value;
                        updateLine(idx, {
                          qty: nextBtl,
                          cl_qty: ctnFromBtl(nextBtl, line.pack_unit),
                        });
                      }}
                      onBlur={(e) => {
                        const nextBtl = fmtCommaInput(e.target.value, 2);
                        updateLine(idx, {
                          qty: nextBtl,
                          cl_qty: ctnFromBtl(nextBtl, line.pack_unit),
                        });
                      }}
                      className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      disabled={isPosted || promoRow || linesReadOnly}
                    />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input
                      id={`ctn-qty-${idx}`}
                      value={line.cl_qty}
                      onChange={(e) => updateLine(idx, { cl_qty: e.target.value })}
                      onBlur={(e) => updateLine(idx, { cl_qty: fmtCommaInput(e.target.value, 4) })}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const nextItemInput = document.getElementById(`item-code-${idx + 1}`) as HTMLInputElement | null;
                        nextItemInput?.focus();
                        nextItemInput?.select();
                      }}
                      className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      disabled={isPosted || promoRow || linesReadOnly}
                    />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input value={fmtComma(line.price_ex, 6)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right" readOnly />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input value={fmtComma(line.pre_tax, 2)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right" readOnly />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input value={fmtComma(line.tax_amount, 2)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right" readOnly />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input
                      value={line.price_tax_inc}
                      onChange={(e) => updateLine(idx, { price_tax_inc: e.target.value })}
                      onBlur={(e) => updateLine(idx, { price_tax_inc: fmtCommaInput(e.target.value, 2) })}
                      className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      disabled={isPosted || promoRow || linesReadOnly}
                    />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input value={fmtComma(line.value_tax_inc, 2)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right" readOnly />
                  </td>
                  <td className="border-b border-border px-1 py-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => deleteLine(idx)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-input bg-background hover:bg-muted disabled:opacity-50"
                      disabled={isPosted || promoRow || linesReadOnly}
                      aria-label="Delete line"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </td>
                      </>
                    );
                  })()}
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-medium">
                <td colSpan={5} className="border-t border-r border-border px-2 py-1 text-right">Totals</td>
                <td colSpan={2} className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.qty, 2)}</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">-</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.sub, 2)}</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.tax, 2)}</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">-</td>
                <td className="border-t border-border px-2 py-1 text-right">{fmtComma(totals.grand, 2)}</td>
                <td className="border-t border-border px-2 py-1" />
              </tr>
            </tfoot>
          </table>

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
                  emptiesTableRows.map((row, i) => (
                    <tr
                      key={`sales-empties-${row.emptiesType}-${i}`}
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
                  ))
                )}
              </tbody>
              {emptiesTableRows.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/30 font-semibold">
                    <td className="border-t border-r border-border px-2 py-1 text-right" />
                    <td className="border-t border-r border-border px-2 py-1 text-right tabular-nums">
                      {fmtComma(emptiesTableRows.reduce((s, r) => s + r.ctnQty, 0), 2)}
                    </td>
                    <td className="border-t border-border px-2 py-1 text-right tabular-nums">
                      {fmtComma(emptiesTableRows.reduce((s, r) => s + r.emptiesValue, 0), 2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-2">
          <div className="flex gap-2">
            <Button size="sm" style={{ backgroundColor: "#bf1d2d" }} className="text-white" onClick={() => submit(true)} disabled={pending || isPosted}>Save</Button>
            <Button size="sm" style={{ backgroundColor: "#1976d2" }} className="text-white" onClick={() => submit(false)} disabled={pending || isPosted}>Save &amp; New</Button>
            <Button size="sm" style={{ backgroundColor: "#f0ad00" }} className="text-white" disabled>Print</Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">Payment is automatically tracked against this invoice.</div>
        </div>
      </div>

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
