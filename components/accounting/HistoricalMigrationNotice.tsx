"use client";

import { useEffect, useState } from "react";

import { getCurrentCompanyId } from "@/lib/services/settingsService";
import { supabase } from "@/lib/supabase";

type MigrationMetadata = {
  accounting_scope?: string;
  historical_cost_basis_complete?: boolean;
  historical_purchases_and_expenses_complete?: boolean;
  opening_bank_cash_balances_complete?: boolean;
  unused_customer_credit_accounted?: boolean;
  unused_credit_liability?: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(Number(value || 0));
}

export default function HistoricalMigrationNotice() {
  const [metadata, setMetadata] = useState<MigrationMetadata | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const companyId = await getCurrentCompanyId();

        const { data, error } = await supabase
          .from("external_migration_reference")
          .select("metadata")
          .eq("company_id", companyId)
          .eq("source_system", "zoho_invoice")
          .eq("entity_type", "migration_batch")
          .eq("external_id", "zoho_invoice_full_import_20260908")
          .maybeSingle();

        if (error || !data?.metadata) return;

        setMetadata(data.metadata as MigrationMetadata);
      } catch {
        // The accounting page remains usable when no historical import exists.
      }
    }

    void load();
  }, []);

  if (!metadata || metadata.accounting_scope !== "historical_sales_and_receipts") {
    return null;
  }

  const incomplete =
    metadata.historical_cost_basis_complete === false ||
    metadata.historical_purchases_and_expenses_complete === false ||
    metadata.opening_bank_cash_balances_complete === false;

  if (!incomplete) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <p className="font-semibold">Historical migration scope</p>

      <p className="mt-2 text-sm leading-6">
        Zoho sales, invoice balances and customer receipts are reconciled in
        Nexus. The source export did not include complete historical inventory
        costs, purchases, expenses or opening/closing bank and cash balances.
        Debtors and receipt history are reliable, but historical net profit and
        the current bank/cash position must not be treated as complete until
        those source records or opening balances are loaded.
      </p>

      {metadata.unused_customer_credit_accounted && (
        <p className="mt-2 text-sm font-medium">
          Unapplied customer receipts captured as Customer Deposits:{" "}
          {money(Number(metadata.unused_credit_liability || 0))}
        </p>
      )}
    </div>
  );
}
