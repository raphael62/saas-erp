"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePromotion } from "@/app/dashboard/sales/promotions/actions";
import { PromotionFormDialog, type Promotion, type PromotionRule } from "@/components/sales/promotion-form-dialog";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  code: string | null;
  name: string;
  unit?: string | null;
  pack_unit?: number | null;
  is_active?: boolean | null;
};

type LookupItem = {
  id: string;
  code?: string | null;
  name: string;
};

export function PromotionList({
  promotions,
  rules,
  products,
  priceTypes,
  locations,
}: {
  promotions: Promotion[];
  rules: PromotionRule[];
  products: Product[];
  priceTypes: LookupItem[];
  locations: LookupItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return promotions;
    return promotions.filter((item) => {
      const haystack = [
        item.promo_code,
        item.name,
        item.start_date,
        item.end_date,
        item.description ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [promotions, search]);

  const editingPromotion = useMemo(
    () => promotions.find((item) => String(item.id) === String(editingPromotionId)) ?? null,
    [promotions, editingPromotionId]
  );

  const editingRules = useMemo(
    () => rules.filter((item) => String(item.promotion_id) === String(editingPromotionId)),
    [rules, editingPromotionId]
  );

  const handleDelete = (id: string) => {
    setMessage(null);
    startTransition(async () => {
      const ok = window.confirm("Delete this promotion?");
      if (!ok) return;
      const result = await deletePromotion(id);
      if (result?.error) {
        setMessage(result.error);
        return;
      }
      setMessage("Promotion deleted.");
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-[460px] flex-col gap-3">
      <div>
        <h1 className="text-xl font-semibold">Promotions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage Buy A - Get B promotions that auto-apply during Sales Invoice entry.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search promotions..."
          className="h-8 w-64 rounded border border-input bg-background px-2 text-sm"
        />
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
        {filtered.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No promotions found.
          </div>
        ) : (
          <table className="min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/40">
              <tr>
                <th className="border-b border-r border-border px-2 py-2 text-left">Promo Code</th>
                <th className="border-b border-r border-border px-2 py-2 text-left">Name</th>
                <th className="border-b border-r border-border px-2 py-2 text-right">Budget (Ctn)</th>
                <th className="border-b border-r border-border px-2 py-2 text-right">Consumed (Ctn)</th>
                <th className="border-b border-r border-border px-2 py-2 text-left">Start Date</th>
                <th className="border-b border-r border-border px-2 py-2 text-left">End Date</th>
                <th className="border-b border-r border-border px-2 py-2 text-left">Status</th>
                <th className="border-b border-border px-2 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="border-b border-r border-border px-2 py-1.5">
                    <button
                      type="button"
                      className="text-[var(--navbar)] hover:underline"
                      onClick={() => {
                        setEditingPromotionId(item.id);
                        setShowForm(true);
                      }}
                    >
                      {item.promo_code}
                    </button>
                  </td>
                  <td className="border-b border-r border-border px-2 py-1.5">{item.name}</td>
                  <td className="border-b border-r border-border px-2 py-1.5 text-right">
                    {item.promo_budget_cartons == null ? "Unlimited" : Number(item.promo_budget_cartons).toFixed(4)}
                  </td>
                  <td className="border-b border-r border-border px-2 py-1.5 text-right">
                    {Number(item.consumed_cartons ?? 0).toFixed(4)}
                  </td>
                  <td className="border-b border-r border-border px-2 py-1.5">{item.start_date}</td>
                  <td className="border-b border-r border-border px-2 py-1.5">{item.end_date}</td>
                  <td className="border-b border-r border-border px-2 py-1.5">
                    {item.is_active === false ? "Inactive" : "Active"}
                  </td>
                  <td className="border-b border-border px-2 py-1 text-center">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(item.id)}
                      disabled={pending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
          onClick={() => {
            setEditingPromotionId(null);
            setShowForm(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New
        </Button>
      </div>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <PromotionFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingPromotionId(null);
        }}
        onSaved={() => {
          setMessage(null);
          router.refresh();
        }}
        products={products}
        priceTypes={priceTypes}
        locations={locations}
        initialPromotion={editingPromotion}
        initialRules={editingRules}
      />
    </div>
  );
}
