"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

import type {
  Invoice,
} from "@/lib/services/invoiceService";

export function useInvoices(
  companyId: string | null
) {
  const [
    invoices,
    setInvoices,
  ] = useState<Invoice[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const refresh =
    useCallback(async () => {
      if (!companyId) {
        setInvoices([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const {
          data,
          error:
            queryError,
        } = await supabase
          .from("invoice")
          .select(
            "id, company_id, branch_id, customer_id, sales_order_id, quotation_id, invoice_number, status, invoice_date, due_date, customer_reference, notes, terms, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, created_by, created_at, updated_at"
          )
          .eq(
            "company_id",
            companyId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (queryError) {
          throw new Error(
            queryError.message
          );
        }

        setInvoices(
          (data ??
            []) as Invoice[]
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Invoices could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    invoices,
    loading,
    error,
    refresh,
  };
}
