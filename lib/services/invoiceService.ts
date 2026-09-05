import { supabase } from "@/lib/supabase";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type Invoice = {
  id: string;
  company_id: string;
  branch_id: string;
  customer_id: string;
  sales_order_id: string | null;
  quotation_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  customer_reference: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  company_id: string;
  inventory_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_mode: "percentage" | "fixed";
  discount_value: number;
  tax_mode: "none" | "vat";
  tax_rate: number;
  line_subtotal: number;
  line_discount: number;
  line_tax: number;
  line_total: number;
  created_at: string;
};

const invoiceColumns =
  "id, company_id, branch_id, customer_id, sales_order_id, quotation_id, invoice_number, status, invoice_date, due_date, customer_reference, notes, terms, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, created_by, created_at, updated_at";

const invoiceItemColumns =
  "id, invoice_id, company_id, inventory_item_id, description, quantity, unit_price, discount_mode, discount_value, tax_mode, tax_rate, line_subtotal, line_discount, line_tax, line_total, created_at";

export async function getInvoice(
  invoiceId: string,
  companyId: string
): Promise<{
  invoice: Invoice;
  items: InvoiceItem[];
}> {
  const [invoiceResult, itemsResult] =
    await Promise.all([
      supabase
        .from("invoice")
        .select(invoiceColumns)
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single(),

      supabase
        .from("invoice_item")
        .select(invoiceItemColumns)
        .eq("invoice_id", invoiceId)
        .eq("company_id", companyId)
        .order("created_at"),
    ]);

  if (invoiceResult.error) {
    throw new Error(invoiceResult.error.message);
  }

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }

  return {
    invoice: invoiceResult.data as Invoice,
    items: (itemsResult.data ?? []) as InvoiceItem[],
  };
}

export async function convertSalesOrderToInvoice(
  salesOrderId: string,
  companyId: string
): Promise<Invoice> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      "You must be logged in to create an invoice."
    );
  }

  const {
    data: salesOrder,
    error: orderError,
  } = await supabase
    .from("sales_order")
    .select(
      "id, company_id, branch_id, customer_id, quotation_id, status, notes"
    )
    .eq("id", salesOrderId)
    .eq("company_id", companyId)
    .single();

  if (orderError) {
    throw new Error(orderError.message);
  }

  if (!salesOrder) {
    throw new Error(
      "Sales order could not be found."
    );
  }

  if (
    !["confirmed", "delivered"].includes(
      salesOrder.status
    )
  ) {
    throw new Error(
      "Only confirmed or delivered sales orders can be invoiced."
    );
  }

  const {
    data: existingInvoice,
    error: existingError,
  } = await supabase
    .from("invoice")
    .select(invoiceColumns)
    .eq("sales_order_id", salesOrderId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingInvoice) {
    return existingInvoice as Invoice;
  }

  const {
    data: orderItems,
    error: itemsError,
  } = await supabase
    .from("sales_order_item")
    .select(
      "inventory_item_id, description, quantity, unit_price, discount_mode, discount_value, tax_mode, tax_rate"
    )
    .eq("sales_order_id", salesOrderId)
    .order("created_at");

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  if (!orderItems || orderItems.length === 0) {
    throw new Error(
      "Sales order has no items."
    );
  }

  const {
    data: invoiceNumber,
    error: numberError,
  } = await supabase.rpc(
    "generate_invoice_number",
    {
      target_company_id: companyId,
    }
  );

  if (numberError) {
    throw new Error(numberError.message);
  }

  const {
    data: invoice,
    error: invoiceError,
  } = await supabase
    .from("invoice")
    .insert({
      company_id: companyId,
      branch_id: salesOrder.branch_id,
      customer_id: salesOrder.customer_id,
      sales_order_id: salesOrder.id,
      quotation_id:
        salesOrder.quotation_id ?? null,
      invoice_number: invoiceNumber,
      status: "draft",
      notes: salesOrder.notes ?? null,
      created_by: user.id,
    })
    .select(invoiceColumns)
    .single();

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  for (const item of orderItems) {
    const { error: itemInsertError } =
      await supabase
        .from("invoice_item")
        .insert({
          invoice_id: invoice.id,
          company_id: companyId,
          inventory_item_id:
            item.inventory_item_id,
          description:
            item.description,
          quantity:
            Number(item.quantity),
          unit_price:
            Number(item.unit_price),
          discount_mode:
            item.discount_mode,
          discount_value:
            Number(
              item.discount_value
            ),
          tax_mode:
            item.tax_mode,
          tax_rate:
            item.tax_mode === "vat"
              ? Number(item.tax_rate)
              : 0,
        });

    if (itemInsertError) {
      throw new Error(
        itemInsertError.message
      );
    }
  }

  const { error: statusError } =
    await supabase
      .from("sales_order")
      .update({
        status: "invoiced",
      })
      .eq("id", salesOrderId)
      .eq("company_id", companyId);

  if (statusError) {
    throw new Error(statusError.message);
  }

  const refreshed =
    await getInvoice(
      invoice.id,
      companyId
    );

  return refreshed.invoice;
}

export async function updateInvoiceStatus(
  invoiceId: string,
  companyId: string,
  status: InvoiceStatus
): Promise<Invoice> {
  const { data, error } =
    await supabase
      .from("invoice")
      .update({
        status,
      })
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .select(invoiceColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Invoice;
}

export type UpdateInvoiceDetailsInput = {
  invoice_date?: string;
  due_date?: string | null;
  customer_reference?: string | null;
  notes?: string | null;
  terms?: string | null;
};

export async function updateInvoiceDetails(
  invoiceId: string,
  companyId: string,
  input: UpdateInvoiceDetailsInput
): Promise<Invoice> {
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("invoice")
    .select("id, status")
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error(
      "Invoice could not be found."
    );
  }

  if (existing.status !== "draft") {
    throw new Error(
      "Only draft invoices can be edited."
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("invoice")
    .update({
      ...input,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .eq("status", "draft")
    .select(invoiceColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Invoice;
}

export type InvoiceChangeLog = {
  id: string;
  company_id: string;
  invoice_id: string;
  invoice_item_id: string | null;
  change_type: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
};

export type UpdateInvoiceItemFinancialsInput = {
  unit_price: number;
  discount_mode:
    | "percentage"
    | "fixed";
  discount_value: number;
  reason?: string;
};

export async function updateInvoiceItemFinancials(
  invoiceItemId: string,
  input: UpdateInvoiceItemFinancialsInput
): Promise<void> {
  const { error } =
    await supabase.rpc(
      "update_invoice_item_financials",
      {
        p_invoice_item_id:
          invoiceItemId,

        p_unit_price:
          input.unit_price,

        p_discount_mode:
          input.discount_mode,

        p_discount_value:
          input.discount_value,

        p_reason:
          input.reason?.trim() ||
          null,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }
}

export async function getInvoiceChangeLog(
  invoiceId: string,
  companyId: string
): Promise<InvoiceChangeLog[]> {
  const {
    data,
    error,
  } = await supabase
    .from("invoice_change_log")
    .select(
      "id, company_id, invoice_id, invoice_item_id, change_type, field_name, old_value, new_value, reason, changed_by, created_at"
    )
    .eq(
      "invoice_id",
      invoiceId
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

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    data ?? []
  ) as InvoiceChangeLog[];
}
