# Empties Process

## Overview

Empties are reusable containers (crates, bottles, plastics) that accompany returnable products. When a customer buys returnable products, they are expected to return the empties. This document describes how empties flow through the system.

## Key Concepts

### Product Types

- **Returnable products**: Regular products (e.g., Malta, FES) with `returnable = true` and an `empties_type` field (e.g., "beer_crate"). Selling these creates an empties obligation for the customer.
- **Empties products**: Products with "empties" in the name (e.g., "Empties Beer Crate"). Each has an `empties_type` that links it to the returnable products sharing the same type. These appear on invoices when a customer pays for empties instead of returning them.

### The Link

Both returnable products and empties products share the same `empties_type` value. This is how the system knows which empties correspond to which returnable goods.

## Empties Receive (Sales Module)

When a customer returns empties, an Empties Receive record is created.

### Column Definitions

| Column     | Editable | Source |
|------------|----------|--------|
| Empties    | No*      | List of empties products (name contains "empties"), type-to-filter for selection |
| Owed       | No       | Historical empties debt from all dates **before** the receive date |
| Expected   | No       | Today's (receive date) sales of **returnable** products, grouped by `empties_type` |
| Sold       | No       | Today's (receive date) sales of **empties** products on the invoice, grouped by `empties_type` |
| Received   | Yes      | Physical empties the customer hands over |
| O/S        | No       | `Owed + Expected - Sold - Received` |

### Owed Calculation

For all sales invoices with `invoice_date < receive_date`:

```
Owed[empties_type] = SUM(returnable cl_qty) - SUM(empties cl_qty) - SUM(previously received qty)
```

- Returnable `cl_qty`: carton quantities of returnable products sold to the customer before the receive date.
- Empties `cl_qty`: carton quantities of empties products on the customer's invoices before the receive date (customer paid for these).
- Previously received: quantities from earlier Empties Receive records (`receive_date < current receive_date`).

### Expected Calculation

For sales invoices with `invoice_date = receive_date`:

```
Expected[empties_type] = SUM(returnable cl_qty on today's invoices)
```

Example: Customer bought Malta 100 cartons and FES 200 cartons today. Both have `empties_type = "beer_crate"`. Expected for "beer_crate" = 300.

### Sold Calculation

For sales invoices with `invoice_date = receive_date`:

```
Sold[empties_type] = SUM(empties cl_qty on today's invoices)
```

When the customer decides to pay for empties instead of returning them, the empties product appears as a line item on the invoice. This increases the invoice value (customer pays more). A negative value means the customer returned more than expected and receives credit.

### Sold Impact on Invoice

- **Sold > 0**: Customer keeps empties and pays for them. The empties product appears on the sales invoice, increasing the total.
- **Sold < 0**: Customer returns more than expected. They get credit (reduces the invoice value).
- The Sold quantity directly affects the customer's invoice value and the empties quantities owed.

### Example

1. Customer has **Owed = 50** crates from previous days.
2. Today, customer buys Malta (100 cartons) and FES (200 cartons), both `empties_type = "beer_crate"`. **Expected = 300**.
3. Customer says "I will pay for 100 crates." We add "Empties Beer Crate" x100 to the invoice. **Sold = 100**.
4. Customer physically returns 200 crates. **Received = 200**.
5. **O/S = 50 + 300 - 100 - 200 = 50** crates still outstanding.

## Empties Dispatch (Purchases Module)

When the company sends empties back to a supplier, an Empties Dispatch record is created.

- Line items are empties products (name contains "empties").
- Cost price is picked from the price list using the credit note date.
- Saving a dispatch adjusts stock quantities.

## Database Tables

### Products (relevant fields)

- `empties_type` (text): Links returnable products to their empties product.
- `returnable` (boolean): Whether the product creates an empties obligation.
- `bottle_cost` (numeric): Cost of bottles per pack.
- `plastic_cost` (numeric): Cost of plastic/crate per pack.

### empties_receives / empties_receive_lines

- Header: receive_no, customer_id, location_id, receive_date, etc.
- Lines: product_id (empties product), sold_qty, owed_qty, expected_qty, received_qty, os_qty.

### empties_dispatches / empties_dispatch_lines

- Header: dispatch_no, supplier_id, dispatch_date, credit_note_date, etc.
- Lines: product_id (empties product), empties_type, qty, unit_price, total_value.
