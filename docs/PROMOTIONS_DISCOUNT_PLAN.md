# Promotions Discount Plan (Deferred)

Status: Deferred for later implementation.

This document captures the agreed approach for adding **Price Discount** and **Quantity Discount** promotions while keeping current **Buy A -> Get B** behavior.

---

## Scope

Add two new promotion behaviors:

1. **Price Discount**
2. **Quantity Discount** (volume-based price reduction, not free goods)

Current `buy_get` flow remains supported.

---

## Promotion Types

Use one promotion record with one rule per promo.

- `buy_get` (existing)
- `price_discount`
- `quantity_discount`

Recommended field on `promotions`:

- `promo_type` (`buy_get` | `price_discount` | `quantity_discount`)

---

## Rule/Configuration Model

Keep one-rule-per-promo and add fields needed for discount behavior.

Recommended additional fields on `promotions` (or single-rule config area):

- `target_product_id` (nullable: when null, promo can apply to all products)
- `min_qty` (optional threshold)
- `discount_method` (`percent` | `fixed_amount`)
- `discount_value` (numeric)

Notes:

- For `price_discount`, apply discount to line unit price when conditions match.
- For `quantity_discount`, activate discount only when quantity threshold is met.

---

## Invoice Application Logic

Apply promo logic at line level during Sales Invoice entry:

1. Evaluate eligibility (date/time/day, price type group, location, active flag).
2. Evaluate line threshold and target product conditions.
3. Apply **one best promo per line** (no stacking in v1).
4. Recompute line values (`price_ex`, `pre_tax`, `tax_amount`, `value_tax_inc`).
5. Show promo indicator on affected line.

Important:

- Discount promos do **not** alter quantity movement.
- `buy_get` continues to create reward lines and affects stock by reward qty.

---

## Persistence for Audit

Store applied promo details in invoice lines to keep historical accuracy.

Recommended fields on `sales_invoice_lines`:

- `promo_id` (nullable)
- `promo_code` (nullable)
- `promo_discount_amount` (numeric, default 0)
- `gross_before_discount` (numeric, optional but recommended)

---

## UI Plan

### Promotions Form

- Add promo type selector (tabs or segmented control):
  - Buy/Get
  - Price Discount
  - Quantity Discount
- Keep one-rule compact line layout.
- Show conditional inputs based on promo type.

### Sales Invoice Line Grid

- Keep existing spreadsheet behavior.
- Show promo badge/label on impacted lines.
- Optionally show discount amount column or tooltip.

---

## Operational Rules (Current System Alignment)

- No draft/posted workflow for Sales Invoices.
- Save/Edit/Delete invoice updates stock and balances according to current live logic.
- Discount promos affect price math; they do not create stock deltas by themselves.

---

## Implementation Order (when resumed)

1. Schema migration for new promo type/discount fields and line audit fields.
2. Promotions form updates (type tabs + conditional fields).
3. Invoice engine update for discount promo evaluation and price recalculation.
4. Persist applied promo metadata on line save/edit/delete.
5. UI polish and regression tests for `buy_get` and existing invoice behavior.

---

## Decision Notes

- v1 uses **one promo per line** (no stacking).
- If multiple promos match, choose the **highest customer benefit**.
- This avoids ambiguous calculations and keeps support/troubleshooting simple.
