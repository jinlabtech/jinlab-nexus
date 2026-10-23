"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { supabase } from "@/lib/supabase";
import type { Invoice } from "@/lib/services/invoiceService";

const emptyInvoices: Invoice[] = [];

export function useInvoices(companyId: string | null) {
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("invoice")
      .select(
        "id, company_id, branch_id, customer_id, sales_order_id, quotation_id, invoice_number, status, invoice_date, due_date, customer_reference, notes, terms, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, created_by, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as Invoice[];
  }, [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId ?? "",
    Boolean(companyId),
    load,
    "Invoices could not be loaded."
  );

  return {
    invoices: data ?? emptyInvoices,
    loading,
    error: errorMessage || null,
    refresh,
  };
}
