"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { getSuggestedOrderNo, saveSalesOrder } from "@/app/dashboard/sales/sales-orders/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type Product = {
  id: string | number;
  code?: string | null;
  name: string;
  pack_unit?: number | null;
};

type Customer = {
  id: string;
  tax_id?: string | null;
  name: string;
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

type Order = {
  id: string;
  order_no: string;
  customer_id?: string | null;
  sales_rep_id?: string | null;
  location_id?: string | null;
  order_date: string;
  delivery_date?: string | null;
  notes?: string | null;
};

type OrderLine = {
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
    !String(line.price_tax_inc || "").replace(/,/g, "").trim()
  );
}

function ctnFromBtl(btlQty: string | number, packUnit: string | number) {
  const pack = n(packUnit);
  if (pack <= 0) return "";
  return fmt(n(btlQty) / pack, 4);
}

export function SalesOrderFormDialog({
  open,
  onOpenChange,
  onSaved,
  products = [],
  customers = [],
  customersError,
  salesReps = [],
  locations = [],
  priceTypes = [],
  priceLists = [],
  priceListItems = [],
  invoices = [],
  initialOrder = null,
  initialLines = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  products?: Product[];
  customers?: Customer[];
  customersError?: string | null;
  salesReps?: SalesRep[];
  locations?: Location[];
  priceTypes?: PriceType[];
  priceLists?: { id: string; price_type_id: string; effective_date?: string | null; expiry_date?: string | null; is_active?: boolean | null; price_types?: { name?: string | null } | null }[];
  priceListItems?: PriceListItem[];
  invoices?: { customer_id?: string | null; invoice_date?: string; location_id?: string | null; balance_os?: number | null }[];
  initialOrder?: Order | null;
  initialLines?: OrderLine[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [orderNoTouched, setOrderNoTouched] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [customerBalanceOs, setCustomerBalanceOs] = useState("0.00");
  const [defaultPriceType, setDefaultPriceType] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerHighlightIndex, setCustomerHighlightIndex] = useState(0);
  const [lineDropdown, setLineDropdown] = useState<{ row: number; field: "code" | "name" } | null>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const customerListRef = useRef<HTMLDivElement>(null);
  const orderNoReqRef = useRef(0);

  const productLookup = useMemo(() => {
    const byId = new Map<string, Product>();
    const byCode = new Map<string, Product>();
    const byName = new Map<string, Product>();
    for (const p of products) {
      byId.set(String(p.id), p);
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
        priceTypeName: String(pl.price_types?.name ?? priceTypeNameById.get(pl.price_type_id) ?? "").trim().toLowerCase(),
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
    const sorted = [...invoices].sort((a, b) => String(b.invoice_date ?? "").localeCompare(String(a.invoice_date ?? "")));
    for (const inv of sorted) {
      if (!inv.customer_id || !inv.location_id || map.has(inv.customer_id)) continue;
      map.set(inv.customer_id, inv.location_id);
    }
    return map;
  }, [invoices]);

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
      return { ...merged, price_ex: "", pre_tax: "", tax_amount: "", value_tax_inc: "" };
    }
    const taxRate = n(merged.tax_rate);
    const priceTaxInc = n(merged.price_tax_inc);
    const pack = n(merged.pack_unit);
    const qtyTotal = n(merged.cl_qty) + (pack > 0 ? n(merged.qty) / pack : n(merged.qty));
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

  function refreshAllLinePrices(nextOrderDate: string, nextDefaultPriceType?: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (!line.product_id) return computeDerived(line);
        const effectivePriceType = line.price_type || nextDefaultPriceType || defaultPriceType;
        if (!effectivePriceType) return computeDerived(line);
        const matched = getEffectivePriceForLine(line.product_id, effectivePriceType, nextOrderDate);
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
      const pack = n(line.pack_unit);
      const q = n(line.cl_qty) + (pack > 0 ? n(line.qty) / pack : n(line.qty));
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

  function updateLine(index: number, patch: Partial<EditLine>) {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const merged = computeDerived({ ...current, ...patch });
      next[index] = merged;
      const last = next[next.length - 1];
      if (last && hasLineData(last)) next.push(blankLine(String(next.length), defaultPriceType));
      return next;
    });
  }

  function deleteLine(index: number) {
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
        prev.map((line) => (!line.price_type ? { ...line, price_type: c.price_type! } : line))
      );
      refreshAllLinePrices(orderDate, c.price_type);
    }
  }

  function selectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const selected = customers.find((c) => c.id === nextCustomerId);
    if (selected) setCustomerQuery(`${selected.tax_id ? `${selected.tax_id} - ` : ""}${selected.name}`);
    applyCustomerDefaults(nextCustomerId);
    setShowCustomerDropdown(false);
  }

  const displayCustomers = filteredCustomers.slice(0, 500);
  const highlightedId = displayCustomers[customerHighlightIndex]?.id ?? null;

  function applyProductToRow(index: number, product: Product) {
    const currentPriceType = lines[index]?.price_type || defaultPriceType;
    const effectivePrice = getEffectivePriceForLine(String(product.id), currentPriceType, orderDate);
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
      by === "code" ? productLookup.byCode.get(value.toLowerCase().trim()) : productLookup.byName.get(value.toLowerCase().trim());
    if (!product) return;
    applyProductToRow(index, product);
  }

  async function submit(closeAfterSave: boolean) {
    setPending(true);
    setError(null);
    const fd = new FormData();
    if (initialOrder?.id) fd.set("id", initialOrder.id);
    if (orderNo) fd.set("order_no", orderNo);
    fd.set("customer_id", customerId);
    if (salesRepId) fd.set("sales_rep_id", salesRepId);
    if (locationId) fd.set("location_id", locationId);
    fd.set("order_date", orderDate);
    if (deliveryDate) fd.set("delivery_date", deliveryDate);
    if (notes) fd.set("notes", notes);

    let row = 0;
    for (const line of lines) {
      const hasData = hasLineData(line);
      if (!hasData) continue;
      fd.set(`line_product_id_${row}`, line.product_id || "");
      fd.set(`line_item_name_${row}`, line.item_name || "");
      fd.set(`line_price_type_${row}`, line.price_type || defaultPriceType || "");
      fd.set(`line_pack_unit_${row}`, line.pack_unit || "0");
      fd.set(`line_qty_${row}`, line.qty || "0");
      fd.set(`line_cl_qty_${row}`, line.cl_qty || "0");
      fd.set(`line_price_ex_${row}`, line.price_ex || "0");
      fd.set(`line_price_tax_inc_${row}`, line.price_tax_inc || "0");
      fd.set(`line_tax_rate_${row}`, line.tax_rate || "0");
      fd.set(`line_tax_amount_${row}`, line.tax_amount || "0");
      fd.set(`line_value_tax_inc_${row}`, line.value_tax_inc || "0");
      fd.set(`line_vat_type_${row}`, "inc");
      row += 1;
    }

    const result = await saveSalesOrder(fd);
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
    setOrderNo("");
    setOrderNoTouched(false);
    setCustomerId("");
    setCustomerQuery("");
    setSalesRepId("");
    setLocationId("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setDeliveryDate("");
    setNotes("");
    setCustomerBalanceOs("0.00");
    setDefaultPriceType("");
    setLines([blankLine("0"), blankLine("1"), blankLine("2")]);
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOrderNo(initialOrder?.order_no ?? "");
    setOrderNoTouched(Boolean(initialOrder?.id || initialOrder?.order_no));
    setCustomerId(initialOrder?.customer_id ?? "");
    const initialCustomer = customers.find((c) => c.id === (initialOrder?.customer_id ?? ""));
    setCustomerQuery(initialCustomer ? `${initialCustomer.tax_id ? `${initialCustomer.tax_id} - ` : ""}${initialCustomer.name}` : "");
    setSalesRepId(initialOrder?.sales_rep_id ?? "");
    setLocationId(initialOrder?.location_id ?? "");
    setOrderDate(initialOrder?.order_date ?? new Date().toISOString().slice(0, 10));
    setDeliveryDate(initialOrder?.delivery_date ?? "");
    setNotes(initialOrder?.notes ?? "");

    const seeded = (initialLines ?? [])
      .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
      .map((line, i) => {
        const product = line.product_id ? productLookup.byId.get(String(line.product_id)) : null;
        const qtyTotal = n(line.cl_qty) + n(line.qty) / Math.max(1, n(line.pack_unit));
        return computeDerived({
          key: String(i),
          product_id: String(line.product_id ?? ""),
          item_code: product?.code ?? "",
          item_name: line.item_name_snapshot ?? product?.name ?? "",
          price_type: line.price_type ?? "",
          pack_unit: fmt(n(line.pack_unit), 2),
          qty: fmt(n(line.qty), 2),
          cl_qty: fmt(n(line.cl_qty), 4),
          price_ex: fmt(n(line.price_ex), 6),
          pre_tax: fmt(n(line.price_ex) * qtyTotal, 2),
          price_tax_inc: fmt(n(line.price_tax_inc), 2),
          tax_rate: fmt(n(line.tax_rate), 3),
          tax_amount: fmt(n(line.tax_amount), 2),
          value_tax_inc: fmt(n(line.value_tax_inc), 2),
        });
      });

    if (seeded.length === 0) setLines([blankLine("0"), blankLine("1"), blankLine("2")]);
    else setLines([...seeded, blankLine(String(seeded.length))]);
  }, [open, initialOrder, initialLines, productLookup.byId, customers]);

  useEffect(() => {
    if (!open) return;
    if (initialOrder?.id) return;
    if (orderNoTouched) return;
    const datePrefix = String(orderDate || "").slice(0, 10);
    if (!datePrefix) {
      setOrderNo("");
      return;
    }
    const requestId = orderNoReqRef.current + 1;
    orderNoReqRef.current = requestId;
    const timer = setTimeout(async () => {
      const res = await getSuggestedOrderNo(datePrefix);
      if (orderNoReqRef.current !== requestId) return;
      if (res?.ok && res.orderNo) setOrderNo(res.orderNo);
    }, 180);
    return () => clearTimeout(timer);
  }, [open, initialOrder?.id, orderDate, orderNoTouched]);

  useEffect(() => {
    if (!customerId) {
      setCustomerBalanceOs("0.00");
      return;
    }
    const outstanding = invoices
      .filter((inv) => inv.customer_id === customerId)
      .reduce((sum, inv) => sum + Number(inv.balance_os ?? 0), 0);
    setCustomerBalanceOs(fmt(outstanding, 2));
  }, [customerId, invoices]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (customerRef.current && !customerRef.current.contains(target)) setShowCustomerDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (showCustomerDropdown) setCustomerHighlightIndex(0);
  }, [showCustomerDropdown, customerQuery, filteredCustomers.length]);

  useEffect(() => {
    if (!showCustomerDropdown || displayCustomers.length === 0) return;
    const el = customerListRef.current?.querySelector(`[data-customer-id="${highlightedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [showCustomerDropdown, highlightedId, displayCustomers.length]);

  function focusLineField(id: string, selectAll?: boolean) {
    requestAnimationFrame(() => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) return;
      el.focus();
      if (selectAll && el instanceof HTMLInputElement) el.select();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialOrder?.id ? "Edit Sales Order" : "New Sales Order"}
      contentClassName="max-w-[1120px] text-sm"
      bodyClassName="max-h-none overflow-visible p-4"
    >
      <div className="space-y-2">
        {error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}

        {/* Header: 3 columns per screenshot */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-3">
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }} title={`${customers.length} customers`}>
              Customer
            </label>
            {customersError && (
              <p className="mb-1 text-xs text-destructive">Load error: {customersError}</p>
            )}
            <div className="relative" ref={customerRef}>
              <input
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onKeyDown={(e) => {
                  if (!showCustomerDropdown) return;
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setShowCustomerDropdown(false);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCustomerHighlightIndex((i) => Math.min(i + 1, displayCustomers.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCustomerHighlightIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter" && displayCustomers.length > 0) {
                    e.preventDefault();
                    selectCustomer(displayCustomers[customerHighlightIndex]!.id);
                  }
                }}
                className={inputClass}
                placeholder="Search customer..."
                autoComplete="off"
              />
              {showCustomerDropdown && (
                <div
                  ref={customerListRef}
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg"
                >
                  {displayCustomers.length > 0 ? (
                    displayCustomers.map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        data-customer-id={c.id}
                        className={`w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80 ${
                          i === customerHighlightIndex ? "bg-muted" : ""
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectCustomer(c.id)}
                        onMouseEnter={() => setCustomerHighlightIndex(i)}
                      >
                        {(c.tax_id ? `${c.tax_id} - ` : "") + c.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-2.5 py-3 text-sm text-muted-foreground">
                      {customersError ? (
                        <span className="text-destructive">Could not load customers: {customersError}</span>
                      ) : customers.length === 0 ? (
                        <>
                          No customers yet.{" "}
                          <a href="/dashboard/sales/customers" className="underline hover:text-foreground">
                            Add customers
                          </a>
                          {" "}first.
                        </>
                      ) : (
                        "No matching customers."
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Sales Rep</label>
            <select
              value={salesRepId}
              onChange={(e) => setSalesRepId(e.target.value)}
              className={inputClass}
            >
              <option value="">Search sales rep...</option>
              {salesReps.map((s) => (
                <option key={s.id} value={s.id}>{(s.code ? `${s.code} - ` : "") + s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Location-Out</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={inputClass}
            >
              <option value="">Search location...</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{(l.code ? `${l.code} - ` : "") + l.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Balance Outst</label>
            <input value={fmtComma(customerBalanceOs, 2)} className={inputClass} readOnly />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Order Date</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => {
                const nextDate = e.target.value;
                setOrderDate(nextDate);
                refreshAllLinePrices(nextDate);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Delivery Date</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={inputClass}
              placeholder="yyyy-mm-dd"
            />
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Order No</label>
            <input
              value={orderNo}
              readOnly
              className={inputClass}
              placeholder="Auto-generated as SO-YYYY-MM-DD-001"
            />
          </div>
          <div className="col-span-2">
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* Line items table */}
        <div className="rounded border border-border">
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th className="border-b border-r border-border px-1 py-2 text-left font-medium" style={{ color: "var(--navbar)", width: 34 }}>#</th>
                <th className="border-b border-r border-border px-1 py-2 text-left font-medium" style={{ color: "var(--navbar)", width: 80 }}>Item Code</th>
                <th className="border-b border-r border-border px-1 py-2 text-left font-medium" style={{ color: "var(--navbar)", width: 150 }}>Item Name</th>
                <th className="border-b border-r border-border px-1 py-2 text-left font-medium" style={{ color: "var(--navbar)", width: 108 }}>Price Type</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 70 }}>Pack Unit</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 64 }}>Btl Qty</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 72 }}>Ctn Qty</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 96 }}>Price (Ex-Tax)</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 92 }}>Pre Tax</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 70 }}>Tax Amt</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 96 }}>Price (Tax-Inc)</th>
                <th className="border-b border-r border-border px-1 py-2 text-right font-medium" style={{ color: "var(--navbar)", width: 96 }}>Value (Tax-Inc)</th>
                <th className="border-b border-border px-1 py-2 text-center font-medium" style={{ color: "var(--navbar)", width: 52 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const codeQuery = line.item_code.toLowerCase().trim();
                const nameQuery = line.item_name.toLowerCase().trim();
                const codeMatches = products.filter(
                  (p) => `${p.code ?? ""}`.toLowerCase().includes(codeQuery) || p.name.toLowerCase().includes(codeQuery)
                );
                const nameMatches = products.filter(
                  (p) => p.name.toLowerCase().includes(nameQuery) || `${p.code ?? ""}`.toLowerCase().includes(nameQuery)
                );
                return (
                  <tr key={line.key} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="border-b border-r border-border px-1 py-1 text-muted-foreground">{idx + 1}</td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <div className="relative">
                        <input
                          id={`so-line-code-${idx}`}
                          value={line.item_code}
                          onChange={(e) => { updateLine(idx, { item_code: e.target.value }); setLineDropdown({ row: idx, field: "code" }); }}
                          onFocus={() => setLineDropdown({ row: idx, field: "code" })}
                          onBlur={(e) => { resolveProduct(idx, e.target.value, "code"); setTimeout(() => setLineDropdown((p) => (p?.row === idx && p?.field === "code" ? null : p)), 120); }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (codeMatches.length > 0) applyProductToRow(idx, codeMatches[0]);
                            focusLineField(`so-line-name-${idx}`, true);
                          }}
                          className="h-7 w-full rounded-none border-0 px-1 text-xs outline-none bg-transparent focus:bg-background"
                          placeholder="Code"
                        />
                        {lineDropdown?.row === idx && lineDropdown.field === "code" && codeMatches.length > 0 && (
                          <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[22rem] overflow-auto rounded border border-border bg-background shadow-xl">
                            {codeMatches.slice(0, 20).map((p) => (
                              <button key={String(p.id)} type="button" className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm hover:bg-muted/80" onMouseDown={(e) => e.preventDefault()} onClick={() => applyProductToRow(idx, p)}>
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
                          id={`so-line-name-${idx}`}
                          value={line.item_name}
                          onChange={(e) => { updateLine(idx, { item_name: e.target.value }); setLineDropdown({ row: idx, field: "name" }); }}
                          onFocus={() => setLineDropdown({ row: idx, field: "name" })}
                          onBlur={(e) => { resolveProduct(idx, e.target.value, "name"); setTimeout(() => setLineDropdown((p) => (p?.row === idx && p?.field === "name" ? null : p)), 120); }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (nameMatches.length > 0) applyProductToRow(idx, nameMatches[0]);
                            focusLineField(`so-line-pricetype-${idx}`);
                          }}
                          className="h-7 w-full rounded-none border-0 px-1 text-xs outline-none bg-transparent focus:bg-background"
                          placeholder="Item name"
                        />
                        {lineDropdown?.row === idx && lineDropdown.field === "name" && nameMatches.length > 0 && (
                          <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[26rem] overflow-auto rounded border border-border bg-background shadow-xl">
                            {nameMatches.slice(0, 20).map((p) => (
                              <button key={String(p.id)} type="button" className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm hover:bg-muted/80" onMouseDown={(e) => e.preventDefault()} onClick={() => applyProductToRow(idx, p)}>
                                {(p.code ? `${p.code} - ` : "") + p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <select
                        id={`so-line-pricetype-${idx}`}
                        value={line.price_type}
                        onChange={(e) => {
                          const nextPriceType = e.target.value;
                          const matched = line.product_id ? getEffectivePriceForLine(line.product_id, nextPriceType, orderDate) : null;
                          updateLine(idx, {
                            price_type: nextPriceType,
                            ...(matched ? { price_tax_inc: fmt(n(matched.price), 2), tax_rate: fmt(n(matched.tax_rate), 3) } : {}),
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          focusLineField(`so-line-pack-${idx}`, true);
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-xs outline-none focus:bg-background"
                      >
                        <option value="">--</option>
                        {priceTypes.map((pt) => (
                          <option key={pt.id} value={pt.name}>{pt.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input
                        id={`so-line-pack-${idx}`}
                        value={line.pack_unit}
                        onChange={(e) => updateLine(idx, { pack_unit: e.target.value, cl_qty: ctnFromBtl(line.qty, e.target.value) })}
                        onBlur={(e) => updateLine(idx, { pack_unit: fmtCommaInput(e.target.value, 2), cl_qty: ctnFromBtl(line.qty, e.target.value) })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          focusLineField(`so-line-qty-${idx}`, true);
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input
                        id={`so-line-qty-${idx}`}
                        value={line.qty}
                        onChange={(e) => updateLine(idx, { qty: e.target.value, cl_qty: ctnFromBtl(e.target.value, line.pack_unit) })}
                        onBlur={(e) => updateLine(idx, { qty: fmtCommaInput(e.target.value, 2), cl_qty: ctnFromBtl(e.target.value, line.pack_unit) })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          focusLineField(`so-line-ctn-${idx}`, true);
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input
                        id={`so-line-ctn-${idx}`}
                        value={line.cl_qty}
                        onChange={(e) => updateLine(idx, { cl_qty: e.target.value })}
                        onBlur={(e) => updateLine(idx, { cl_qty: fmtCommaInput(e.target.value, 4) })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          focusLineField(`so-line-priceinc-${idx}`, true);
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input value={fmtComma(line.price_ex, 6)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" readOnly />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input value={fmtComma(line.pre_tax, 2)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" readOnly />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input value={fmtComma(line.tax_amount, 2)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" readOnly />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input
                        id={`so-line-priceinc-${idx}`}
                        value={line.price_tax_inc}
                        onChange={(e) => updateLine(idx, { price_tax_inc: e.target.value })}
                        onBlur={(e) => updateLine(idx, { price_tax_inc: fmtCommaInput(e.target.value, 2) })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const next = document.getElementById(`so-line-code-${idx + 1}`) as HTMLInputElement | null;
                          if (next) {
                            next.focus();
                            next.select();
                          }
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input value={fmtComma(line.value_tax_inc, 2)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" readOnly />
                    </td>
                    <td className="border-b border-border px-1 py-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => deleteLine(idx)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-input bg-background hover:bg-muted"
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
        </div>

        <p className="text-sm text-green-600">● Price auto-filled from price list (editable)</p>

        <div className="flex items-center gap-3 border-t border-border pt-2">
          <div className="flex gap-2">
            <Button size="sm" style={{ backgroundColor: "var(--navbar)" }} className="text-white" onClick={() => submit(true)} disabled={pending}>
              Save
            </Button>
            <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => submit(false)} disabled={pending}>
              Save &amp; New
            </Button>
            <Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" disabled>
              Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
