import { supabase } from "@/lib/supabase";

import type {
  SalesOrder,
  SalesOrderFormData,
  SalesOrderItem,
  SalesOrderItemFormData,
  SalesOrderStatus,
  SalesOrderWithItems,
  SalesPaymentBasis,
} from "@/types/sales";

const salesOrderColumns =
  "id, company_id, branch_id, customer_id, quotation_id, sales_order_number, status, payment_basis, order_date, expected_delivery, notes, subtotal, discount_amount, tax_amount, total_amount, created_by, created_at, updated_at";

const salesOrderItemColumns =
  "id, sales_order_id, inventory_item_id, description, quantity, unit_price, discount_mode, discount_value, tax_mode, tax_rate, line_subtotal, line_discount, line_tax, line_total, created_at";

export async function getSalesOrders(
  companyId: string
): Promise<SalesOrder[]> {
  const { data, error } = await supabase
    .from("sales_order")
    .select(salesOrderColumns)
    .eq("company_id", companyId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SalesOrder[];
}

export async function getSalesOrder(
  salesOrderId: string,
  companyId: string
): Promise<SalesOrderWithItems> {
  const [
    orderResult,
    itemsResult,
  ] = await Promise.all([
    supabase
      .from("sales_order")
      .select(salesOrderColumns)
      .eq("id", salesOrderId)
      .eq("company_id", companyId)
      .single(),

    supabase
      .from("sales_order_item")
      .select(salesOrderItemColumns)
      .eq(
        "sales_order_id",
        salesOrderId
      )
      .order("created_at", {
        ascending: true,
      }),
  ]);

  if (orderResult.error) {
    throw new Error(
      orderResult.error.message
    );
  }

  if (itemsResult.error) {
    throw new Error(
      itemsResult.error.message
    );
  }

  return {
    sales_order:
      orderResult.data as SalesOrder,

    items:
      (itemsResult.data ??
        []) as SalesOrderItem[],
  };
}

export async function createSalesOrder(
  companyId: string,
  formData: SalesOrderFormData
): Promise<SalesOrder> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      "You must be logged in to create a sales order."
    );
  }

  const {
    data: generatedNumber,
    error: numberError,
  } = await supabase.rpc(
    "generate_sales_order_number",
    {
      target_company_id: companyId,
    }
  );

  if (numberError) {
    throw new Error(
      numberError.message
    );
  }

  const { data, error } =
    await supabase
      .from("sales_order")
      .insert({
        company_id: companyId,
        branch_id:
          formData.branch_id,
        customer_id:
          formData.customer_id,
        quotation_id:
          formData.quotation_id ??
          null,

        payment_basis:
          formData.payment_basis ??
          null,

        sales_order_number:
          generatedNumber,
        expected_delivery:
          formData.expected_delivery ||
          null,
        notes:
          formData.notes || null,
        status: "draft",
        created_by: user.id,
      })
      .select(salesOrderColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as SalesOrder;
}

export async function addSalesOrderItem(
  salesOrderId: string,
  formData: SalesOrderItemFormData
): Promise<SalesOrderItem> {
  const { data, error } =
    await supabase
      .from("sales_order_item")
      .insert({
        sales_order_id:
          salesOrderId,

        inventory_item_id:
          formData.inventory_item_id ||
          null,

        description:
          formData.description.trim(),

        quantity:
          formData.quantity,

        unit_price:
          formData.unit_price,

        discount_mode:
          formData.discount_mode,

        discount_value:
          formData.discount_value,

        tax_mode:
          formData.tax_mode,

        tax_rate:
          formData.tax_mode === "vat"
            ? formData.tax_rate
            : 0,
      })
      .select(
        salesOrderItemColumns
      )
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as SalesOrderItem;
}

export async function updateSalesOrderItem(
  itemId: string,
  formData: SalesOrderItemFormData
): Promise<SalesOrderItem> {
  const { data, error } =
    await supabase
      .from("sales_order_item")
      .update({
        inventory_item_id:
          formData.inventory_item_id ||
          null,

        description:
          formData.description.trim(),

        quantity:
          formData.quantity,

        unit_price:
          formData.unit_price,

        discount_mode:
          formData.discount_mode,

        discount_value:
          formData.discount_value,

        tax_mode:
          formData.tax_mode,

        tax_rate:
          formData.tax_mode === "vat"
            ? formData.tax_rate
            : 0,
      })
      .eq("id", itemId)
      .select(
        salesOrderItemColumns
      )
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as SalesOrderItem;
}

export async function deleteSalesOrderItem(
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("sales_order_item")
    .delete()
    .eq("id", itemId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateSalesOrderStatus(
  salesOrderId: string,
  companyId: string,
  status: SalesOrderStatus
): Promise<SalesOrder> {
  const { data, error } =
    await supabase
      .from("sales_order")
      .update({
        status,
      })
      .eq("id", salesOrderId)
      .eq("company_id", companyId)
      .select(salesOrderColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as SalesOrder;
}

export async function convertQuotationToSalesOrder(
  quotationId: string,
  companyId: string
): Promise<SalesOrder> {
  const {
    data: quotation,
    error: quotationError,
  } = await supabase
    .from("quotation")
    .select(
      "id, company_id, customer_id, branch_id, status, notes"
    )
    .eq("id", quotationId)
    .eq("company_id", companyId)
    .single();

  if (quotationError) {
    throw new Error(
      quotationError.message
    );
  }

  if (!quotation) {
    throw new Error(
      "Quotation could not be found."
    );
  }

  if (
    quotation.status !==
    "accepted"
  ) {
    throw new Error(
      "Only accepted quotations can be converted to sales orders."
    );
  }

  const {
    data: existingOrder,
    error: existingOrderError,
  } = await supabase
    .from("sales_order")
    .select(salesOrderColumns)
    .eq(
      "quotation_id",
      quotationId
    )
    .eq(
      "company_id",
      companyId
    )
    .maybeSingle();

  if (existingOrderError) {
    throw new Error(
      existingOrderError.message
    );
  }

  if (existingOrder) {
    return existingOrder as SalesOrder;
  }

  const {
    data: quotationItems,
    error: itemsError,
  } = await supabase
    .from("quotation_item")
    .select(
      "inventory_item_id, description, quantity, unit_price, discount_mode, discount_value, tax_mode, tax_rate"
    )
    .eq(
      "quotation_id",
      quotationId
    )
    .eq(
      "company_id",
      companyId
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (itemsError) {
    throw new Error(
      itemsError.message
    );
  }

  if (
    !quotationItems ||
    quotationItems.length === 0
  ) {
    throw new Error(
      "Quotation has no items."
    );
  }

  const salesOrder =
    await createSalesOrder(
      companyId,
      {
        customer_id:
          quotation.customer_id,

        branch_id:
          quotation.branch_id,

        payment_basis:
          null,

        expected_delivery:
          null,

        notes:
          quotation.notes
            ? `Converted from quotation ${quotationId}\n\n${quotation.notes}`
            : `Converted from quotation ${quotationId}`,

        quotation_id:
          quotation.id,
      }
    );

  for (
    const item of
    quotationItems
  ) {
    await addSalesOrderItem(
      salesOrder.id,
      {
        inventory_item_id:
          item.inventory_item_id,

        description:
          item.description,

        quantity:
          Number(
            item.quantity
          ),

        unit_price:
          Number(
            item.unit_price
          ),

        discount_mode:
          item.discount_mode,

        discount_value:
          Number(
            item.discount_value
          ),

        tax_mode:
          item.tax_mode,

        tax_rate:
          Number(
            item.tax_rate
          ),
      }
    );
  }

  return salesOrder;
}


// ============================================================
// SALES CREDIT CONTROL
// ============================================================

export type SalesOrderCreditControl = {
  ok: boolean;

  sales_order_id: string;

  customer_id: string;
  customer_name: string;

  sales_order_status:
    SalesOrderStatus;

  payment_basis:
    SalesPaymentBasis | null;

  collection_status: string;

  credit_hold: boolean;

  credit_hold_reason:
    string | null;

  credit_limit: number;
  limit_configured: boolean;

  receivables: number;
  open_credit_orders: number;

  current_exposure: number;
  current_order_amount: number;

  projected_exposure: number;

  available_credit_before_order:
    number | null;

  available_credit_after_order:
    number | null;

  credit_limit_exceeded: boolean;

  credit_control_blocked: boolean;

  override:
    {
      id: string;
      reason: string;

      approved_by: string;
      approved_at: string;

      used_at:
        string | null;

      scope:
        | "credit_hold"
        | "credit_limit"
        | "both"
        | null;

      approved_total_amount:
        number | null;

      approved_exposure:
        number | null;

      approved_credit_limit:
        number | null;

      signature_valid: boolean;
      valid: boolean;
    } | null;
};


export async function getSalesOrderCreditControl(
  salesOrderId: string
): Promise<SalesOrderCreditControl> {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_sales_order_credit_control",
      {
        p_sales_order_id:
          salesOrderId,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as
    SalesOrderCreditControl;
}


export async function setSalesOrderPaymentBasis(
  salesOrderId: string,
  paymentBasis:
    SalesPaymentBasis
): Promise<SalesOrder> {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "set_sales_order_payment_basis",
      {
        p_sales_order_id:
          salesOrderId,

        p_payment_basis:
          paymentBasis,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as SalesOrder;
}


export async function approveSalesCreditHoldOverride(
  salesOrderId: string,
  reason: string
) {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "approve_sales_credit_hold_override",
      {
        p_sales_order_id:
          salesOrderId,

        p_reason:
          reason,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data;
}


// ============================================================
// SALES ORDER PAYMENTS
// ============================================================

export type SalesOrderPaymentMethod =
  | "cash"
  | "eft"
  | "card"
  | "other";


export type SalesOrderPaymentRecord = {
  id: string;

  payment_date: string;

  payment_method:
    SalesOrderPaymentMethod;

  reference: string | null;

  amount: number;

  notes: string | null;

  received_by: string | null;

  created_at: string;
};


export type SalesOrderPaymentSummary = {
  ok: boolean;

  sales_order_id: string;

  payment_basis:
    SalesPaymentBasis | null;

  order_total: number;

  amount_paid: number;

  balance_due: number;

  fully_paid: boolean;

  payment_count: number;

  payments:
    SalesOrderPaymentRecord[];
};


export async function getSalesOrderPaymentSummary(
  salesOrderId: string
): Promise<SalesOrderPaymentSummary> {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_sales_order_payment_summary",
      {
        p_sales_order_id:
          salesOrderId,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as
    SalesOrderPaymentSummary;
}


export async function recordSalesOrderPayment(
  salesOrderId: string,
  input: {
    paymentDate: string;

    paymentMethod:
      SalesOrderPaymentMethod;

    reference?:
      string | null;

    amount: number;

    notes?:
      string | null;
  }
): Promise<string> {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "record_sales_order_payment",
      {
        p_sales_order_id:
          salesOrderId,

        p_payment_date:
          input.paymentDate,

        p_payment_method:
          input.paymentMethod,

        p_reference:
          input.reference ??
          null,

        p_amount:
          input.amount,

        p_notes:
          input.notes ??
          null,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as string;
}
