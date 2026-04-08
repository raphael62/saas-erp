"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same shape as location transfer line items (cartons / bottles / computed ctn qty). */
export type TransferStyleLine = {
  id?: string;
  product_id: string;
  /** `null` = empty field (no default zero). */
  cartons: number | null;
  bottles: number | null;
  ctn_qty: number;
  notes?: string | null;
  row_no: number;
};

export type TransferStyleProduct = {
  id: string;
  code?: string | null;
  name: string;
  pack_unit?: number | null;
};

function productLabel(p: TransferStyleProduct) {
  const code = String(p.code ?? "").trim();
  const name = String(p.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

function filterProducts(products: TransferStyleProduct[], q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return products;
  return products.filter((p) => {
    const code = String(p.code ?? "").toLowerCase();
    const name = String(p.name ?? "").toLowerCase();
    const hay = `${code} ${name}`.trim();
    const label = productLabel(p).toLowerCase();
    return hay.includes(s) || label.includes(s);
  });
}

/** When query is empty, show at most this many rows so the list stays usable. */
const PRODUCT_LIST_MAX_UNFILTERED = 250;

function recalcCtnQty(line: TransferStyleLine, products: TransferStyleProduct[]): TransferStyleLine {
  const product = products.find((p) => p.id === line.product_id);
  const packUnit = Number(product?.pack_unit ?? 0);
  const cartons = line.cartons ?? 0;
  const bottles = line.bottles ?? 0;
  const ctnQty =
    packUnit > 0
      ? Number((cartons + bottles / packUnit).toFixed(4))
      : Number(cartons.toFixed(4));
  return { ...line, ctn_qty: ctnQty };
}

const qtyNoSpinner =
  "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function emptyLine(rowNo: number): TransferStyleLine {
  return { product_id: "", cartons: null, bottles: null, ctn_qty: 0, notes: "", row_no: rowNo };
}

/** Blank line rows for new forms (e.g. stock count starts with 3). */
export function blankTransferLines(count: number): TransferStyleLine[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => emptyLine(i + 1));
}

function ProductTypeaheadCell({
  products,
  productId,
  rowIndex,
  onPick,
  onEnterToCartons,
  inputRef,
}: {
  products: TransferStyleProduct[];
  productId: string;
  rowIndex: number;
  onPick: (id: string) => void;
  onEnterToCartons: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /** After focus, treat as "browse all" until the user types (avoids filtering on the full selected label). */
  const [browseAll, setBrowseAll] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputMeasureRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  useEffect(() => {
    if (selected) setText(productLabel(selected));
    else if (!productId) setText("");
  }, [productId, selected]);

  const effectiveQuery =
    browseAll && productId && selected && text === productLabel(selected) ? "" : text;

  const filteredFull = useMemo(() => filterProducts(products, effectiveQuery), [products, effectiveQuery]);

  const listTruncated = !effectiveQuery.trim() && filteredFull.length > PRODUCT_LIST_MAX_UNFILTERED;
  const filtered = useMemo(
    () => (listTruncated ? filteredFull.slice(0, PRODUCT_LIST_MAX_UNFILTERED) : filteredFull),
    [filteredFull, listTruncated]
  );

  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, filtered.length - 1)));
  }, [filtered]);

  const updateDropdownPosition = useCallback(() => {
    const el = inputMeasureRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 280);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
    setDropdownPos({ top: r.bottom + 4, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open || filtered.length === 0) {
      setDropdownPos(null);
      return;
    }
    updateDropdownPosition();
  }, [open, filtered.length, text, effectiveQuery, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateDropdownPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const commitPick = useCallback(
    (id: string) => {
      onPick(id);
      setOpen(false);
      setTimeout(() => onEnterToCartons(), 0);
    },
    [onPick, onEnterToCartons]
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) {
        const pick = filtered[Math.min(highlight, filtered.length - 1)];
        if (pick) commitPick(pick.id);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const listContent =
    open &&
    filtered.length > 0 &&
    dropdownPos &&
    typeof document !== "undefined" ? (
      createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] max-h-52 overflow-y-auto rounded-md border border-border bg-popover py-1 text-sm shadow-lg"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            maxWidth: "min(480px, calc(100vw - 16px))",
          }}
        >
          <ul role="listbox" className="min-w-0">
            {filtered.map((p, i) => (
              <li key={p.id} role="option" aria-selected={p.id === productId}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => commitPick(p.id)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full px-2 py-1.5 text-left hover:bg-muted/80",
                    i === highlight && "bg-muted/80"
                  )}
                >
                  {productLabel(p)}
                </button>
              </li>
            ))}
            {listTruncated ? (
              <li className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                Showing {PRODUCT_LIST_MAX_UNFILTERED} of {filteredFull.length}. Type to narrow the list.
              </li>
            ) : null}
          </ul>
        </div>,
        document.body
      )
    ) : null;

  return (
    <div ref={rootRef} className="relative min-w-[12rem]">
      <input
        ref={(el) => {
          inputMeasureRef.current = el;
          inputRef(el);
        }}
        type="text"
        value={text}
        onChange={(e) => {
          setBrowseAll(false);
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (productId) onPick("");
        }}
        onFocus={() => {
          setOpen(true);
          setBrowseAll(true);
        }}
        onBlur={() => setBrowseAll(false)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        placeholder="Code or name — full list on focus"
        aria-label={`Product search row ${rowIndex + 1}`}
        className="h-8 w-full rounded border border-input bg-background px-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklch,var(--navbar)_40%,transparent)] focus-visible:ring-offset-2"
      />
      {listContent}
    </div>
  );
}

type Props = {
  products: TransferStyleProduct[];
  lines: TransferStyleLine[];
  onLinesChange: Dispatch<SetStateAction<TransferStyleLine[]>>;
  itemsHeading?: string;
  /** When the user removes every row, restore this many blank rows (default 1). */
  minRowsWhenEmpty?: number;
};

export function TransferStyleLineItemsTable({
  products,
  lines,
  onLinesChange,
  itemsHeading = "Items",
  minRowsWhenEmpty = 1,
}: Props) {
  const productRefs = useRef<Array<HTMLInputElement | null>>([]);
  const cartonsRefs = useRef<Array<HTMLInputElement | null>>([]);
  const bottlesRefs = useRef<Array<HTMLInputElement | null>>([]);

  const setProductRef = useCallback((idx: number) => (el: HTMLInputElement | null) => {
    productRefs.current[idx] = el;
  }, []);
  const setCartonsRef = useCallback((idx: number) => (el: HTMLInputElement | null) => {
    cartonsRefs.current[idx] = el;
  }, []);
  const setBottlesRef = useCallback((idx: number) => (el: HTMLInputElement | null) => {
    bottlesRefs.current[idx] = el;
  }, []);

  const updateLine = useCallback(
    (idx: number, patch: Partial<TransferStyleLine>) => {
      onLinesChange((prev) =>
        prev.map((l, i) => {
          if (i !== idx) return l;
          return recalcCtnQty({ ...l, ...patch }, products);
        })
      );
    },
    [onLinesChange, products]
  );

  const addRow = useCallback(() => {
    onLinesChange((prev) => [...prev, emptyLine(prev.length + 1)]);
  }, [onLinesChange]);

  const removeRow = useCallback(
    (idx: number) => {
      onLinesChange((prev) => {
        const out = prev.filter((_, i) => i !== idx);
        if (out.length === 0) return blankTransferLines(minRowsWhenEmpty);
        return out.map((l, i) => ({ ...l, row_no: i + 1 }));
      });
    },
    [onLinesChange, minRowsWhenEmpty]
  );

  const focusCartons = useCallback((idx: number) => {
    setTimeout(() => cartonsRefs.current[idx]?.focus(), 0);
  }, []);

  const onCartonsEnter = useCallback((idx: number) => {
    setTimeout(() => bottlesRefs.current[idx]?.focus(), 0);
  }, []);

  const onBottlesEnter = useCallback(
    (idx: number) => {
      onLinesChange((prev) => {
        if (idx < prev.length - 1) {
          setTimeout(() => productRefs.current[idx + 1]?.focus(), 0);
          return prev;
        }
        const next = [...prev, emptyLine(prev.length + 1)];
        setTimeout(() => productRefs.current[next.length - 1]?.focus(), 0);
        return next;
      });
    },
    [onLinesChange]
  );

  return (
    <div className="rounded border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <p className="text-sm font-medium">{itemsHeading}</p>
        <button type="button" className="text-xs font-medium text-[var(--navbar)] hover:underline" onClick={addRow}>
          + Add Row
        </button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-xs text-muted-foreground">
              <th className="px-2 py-2 text-left">Product</th>
              <th className="px-2 py-2 text-right">Cartons</th>
              <th className="px-2 py-2 text-right">Bottles</th>
              <th className="px-2 py-2 text-right">Ctn Qty</th>
              <th className="px-2 py-2 text-left">Notes</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={`${idx}-${line.row_no}`} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5">
                  <ProductTypeaheadCell
                    products={products}
                    productId={line.product_id}
                    rowIndex={idx}
                    onPick={(id) => updateLine(idx, { product_id: id })}
                    onEnterToCartons={() => focusCartons(idx)}
                    inputRef={setProductRef(idx)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    ref={setCartonsRef(idx)}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.cartons == null ? "" : String(line.cartons)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === "") updateLine(idx, { cartons: null });
                      else updateLine(idx, { cartons: Number(raw) });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onCartonsEnter(idx);
                      }
                    }}
                    className={cn(
                      "h-8 w-24 rounded border border-input bg-background px-2 text-right text-sm",
                      qtyNoSpinner
                    )}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    ref={setBottlesRef(idx)}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.bottles == null ? "" : String(line.bottles)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === "") updateLine(idx, { bottles: null });
                      else updateLine(idx, { bottles: Number(raw) });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onBottlesEnter(idx);
                      }
                    }}
                    className={cn(
                      "h-8 w-24 rounded border border-input bg-background px-2 text-right text-sm",
                      qtyNoSpinner
                    )}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    value={line.ctn_qty}
                    readOnly
                    className={cn(
                      "h-8 w-28 rounded border border-input bg-muted/50 px-2 text-right text-sm",
                      qtyNoSpinner
                    )}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={String(line.notes ?? "")}
                    onChange={(e) => updateLine(idx, { notes: e.target.value })}
                    className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                    placeholder="—"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
