# MasterBooks ERP – Ground Rules

Documented rules and conventions for this project. Update this file as we add new rules.

---

## UI/UX (Ecount-inspired)

### Excel-like spreadsheet form

All tables and form line items use an **Excel-like spreadsheet** interface:

- **Tables** (products, customers, orders, etc.):
  - Grid layout with columns and rows
  - Inline cell editing
  - Keyboard navigation (Tab, Enter, arrow keys)
  - Copy/paste support where applicable

- **Form line items** (order lines, invoice lines, PO lines):
  - Same spreadsheet-style grid
  - Add row, delete row
  - Tab through cells for data entry

### Popup forms

All input forms (Add product, Add customer, New record, etc.) must be **popup forms** — modal/dialog overlays, not inline forms on the page. Use a Dialog or Sheet component; avoid expanding forms inline above or below the list.

### Form styling (popup forms)

All popup/dialog forms must follow these standards:

- **Labels**
  - Use theme color: `style={{ color: "var(--navbar)" }}` (red accent, matches header)
  - Font: `text-xs font-medium`
  - Spacing: `mb-0.5` below label

- **Inputs**
  - Height: `h-8` (compact)
  - Padding: `px-2.5`
  - Font: `text-sm`
  - Border: `rounded border border-input bg-background`
  - This is now globally enforced in `app/globals.css` for all form inputs, selects, and textareas.

### Global form font standard

- **Standard size for all input forms:** `text-sm` (`0.875rem`).
- **Applies to:** `input` (except checkbox/radio), `select`, and `textarea` inside any `form`.
- **Source of truth:** `app/globals.css` (`--form-input-font-size`, `--form-input-line-height`).

- **Textareas**
  - Same font and padding as inputs
  - Min height: `min-h-[3.5rem]`, `resize-none`

- **Form layout**
  - Dialog content: `max-w-4xl text-sm` for two-column forms
  - Column gap: `gap-x-6 gap-y-3`
  - Row spacing: `space-y-3` between fields

- **Checkboxes**
  - Size: `h-3.5 w-3.5`
  - Label text: `text-xs` with theme color

- **Required fields**
  - Mark with asterisk in label (e.g. `Product Code *`)
  - Use HTML `required` and server-side validation

*Reference:* `components/inventory/product-form-dialog.tsx`

### Lookup fields (master data)

Master data fields (BrandCategory, Unit of Measure, Empties Type, Vendor, etc.) use a **type-and-select + search** pattern:

1. **Editable input** – User can type to filter options.
2. **Inline dropdown** – On focus or typing, show a filtered list. Click an option to select.
3. **Search button** – Magnifying-glass icon opens a full search dialog for:
   - Browsing/searching all records
   - New (F2) – create a new record
   - Edit – select a row, click Edit to update
   - Double-click row to pick and close

**Structure:**
- Input + search icon button (flex container, `relative`)
- Dropdown: `absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border`
- Dropdown options show code and name (e.g. `00001 — GGBL Fulls`)

**Reference:** `components/inventory/product-form-dialog.tsx` (BrandCategory, Unit of Measure, Empties Type), `components/inventory/category-search-dialog.tsx`

---

## Role-based menus

Navigation items are filtered by user role. Users only see menus they are authorized to access.

- **admin** – Sees all modules
- **sales** – Dashboard, Sales, POS, Inventory, Reports, Preferences
- **purchasing** – Dashboard, Purchases, Inventory, Reports, Preferences
- **inventory** – Dashboard, Inventory, Production, Reports, Preferences
- **accounting** – Dashboard, Accounting, Reports, Preferences
- **hr** – Dashboard, HR & Payroll, Reports, Preferences
- **member** or **null** – Sees all (default for backward compatibility)

**Database:** Ensure `profiles.role` exists. Run `supabase/ADD_ROLE_IF_MISSING.sql` if needed.

**Testing:** Update a user's `role` in Supabase (e.g. to `sales`) to see filtered menus. Nav items are hidden; direct URL access is not yet blocked.

---

## Business Formulas

### Daily target (system-wide)

**Formula:** Daily target = Total target ÷ (month days − Sundays)

Working days = calendar days in the month excluding Sundays. Used for:
- POS/SSR daily sales targets and commission tracking
- VSR daily target quantities on load-out sheets
- “Expected by today” and qualifying-day calculations

**Implementation:** `lib/month-working-days.ts` — `dailyTargetFromMonthly()`, `countMonthDaysExcludingSundays()`

### Commission (POS/SSR)

**Rule:** Commission is earned daily, only when 100% of that day's target is achieved.
- For each day: if daily sales ≥ daily target → commission = daily sales × commission %; else → 0 (lost)
- No monthly roll-up: if you miss the daily target, that day's commission is lost
- Commission earned = sum over qualifying days (sales ≥ target) of (that day's net sales × commission %)
- Full commission = monthly target × commission % (reference / cap)
- Commission at risk = max(0, full commission − commission earned)

---

## Setup (SQL to run)

- `RUN_THIS_IN_SUPABASE.sql` – base schema (organizations, profiles, auth trigger, org insert policy)
- `FIX_ORGANIZATION_INSERT.sql` – if organizations table stays empty: adds insert policy + backfills orgs for existing users
- `ADD_PRODUCTS_AND_ORG.sql` – products table, org creation
- `ADD_CUSTOMERS.sql` – customers table
- `ADD_SALES_REPS_AND_CUSTOMER_FIELDS.sql` – sales_reps table, price_type and sales_rep_id on customers
- `ADD_SUPPLIERS.sql` – suppliers table
- `ADD_MASTER_DATA_LOOKUPS.sql` – brand_categories, empties_types, price_types, units_of_measure, payment_methods, location_types, customer_groups, customer_types
- `ADD_PRODUCT_PRICES.sql` – legacy product_prices table (old price UI)
- `ADD_PRICE_LISTS.sql` – price_lists and price_list_items tables for Sales > Price List document UI
- `ADD_PRODUCT_FIELDS.sql` – extra product columns (code, pack_unit, barcode, etc.)
- `ADD_SALES_REP_FORM_FIELDS.sql` – extra sales rep fields for business executive form (first/last name, type, company, email, location)
- `FIX_PRODUCTS_TABLE.sql` – fix/align existing `products` table (keeps empties costs, removes selling-price columns)
- `ADD_ROLE_IF_MISSING.sql` – add role column to profiles if needed

---

*Last updated: March 2025*
