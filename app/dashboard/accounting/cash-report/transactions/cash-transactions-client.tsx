"use client";

import type { CashTransactionsResult } from "../actions";
import { CashLedgerContent } from "../cash-ledger-content";

export function CashTransactionsClient({
  orgName,
  result,
  from,
  to,
  backHref,
}: {
  orgName: string;
  result: CashTransactionsResult;
  from: string;
  to: string;
  backHref: string;
}) {
  return (
    <CashLedgerContent
      orgName={orgName}
      result={result}
      from={from}
      to={to}
      layout="page"
      backHref={backHref}
    />
  );
}
