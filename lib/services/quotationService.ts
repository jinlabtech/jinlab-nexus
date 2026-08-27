import { supabase } from "@/lib/supabase";

import type {
  Quotation,
  QuotationFormData,
  QuotationItem,
  QuotationItemFormData,
  QuotationStatus,
  QuotationWithItems,
} from "@/types/quotation";

const quotationColumns =
  "id, company_id, customer_id, branch_id, created_by, quotation_number, status, quotation_date, valid_until, customer_reference, notes, terms, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at";

const quotationItemColumns =
  "id, quotation_id, company_id, inventory_item_id, description, quantity, unit_price, discount_mode, discount_value, discount_rate, tax_mode, tax_rate, line_subtotal, line_discount, line_tax, line_total, created_at";

export async function getQuotations(
  companyId: string
): Promise<Quotation[]> {
  const { data, error } = await supabase
    .from("quotation")
    .select(quotationColumns)
    .eq("company_id", companyId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getQuotation(
  quotationId: string,
  companyId: string
): Promise<QuotationWithItems> {
  const {
    data: quotation,
    error: quotationError,
  } = await supabase
    .from("quotation")
    .select(quotationColumns)
    .eq("id", quotationId)
    .eq("company_id", companyId)
    .single();

  if (quotationError) {
    throw new Error(
      quotationError.message
    );
  }

  const {
    data: items,
    error: itemsError,
  } = await supabase
    .from("quotation_item")
    .select(quotationItemColumns)
    .eq("quotation_id", quotationId)
    .eq("company_id", companyId)
    .order("created_at");

  if (itemsError) {
    throw new Error(
      itemsError.message
    );
  }

  return {
    quotation,
    items: items ?? [],
  };
}

export async function createQuotation(
  companyId: string,
  formData: QuotationFormData
): Promise<Quotation> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      userError?.message ??
        "Authenticated user required."
    );
  }

  const {
    data: quotationNumber,
    error: numberError,
  } = await supabase.rpc(
    "generate_quotation_number",
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
      .from("quotation")
      .insert({
        company_id: companyId,
        customer_id:
          formData.customer_id,
        branch_id:
          formData.branch_id,
        created_by:
          user.id,
        quotation_number:
          quotationNumber,
        status:
          "draft",
        valid_until:
          formData.valid_until ||
          null,
        customer_reference:
          formData.customer_reference ||
          null,
        notes:
          formData.notes ||
          null,
        terms:
          formData.terms ||
          null,
      })
      .select(quotationColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateQuotation(
  quotationId: string,
  companyId: string,
  formData: QuotationFormData
): Promise<Quotation> {
  const { data, error } =
    await supabase
      .from("quotation")
      .update({
        customer_id:
          formData.customer_id,
        branch_id:
          formData.branch_id,
        valid_until:
          formData.valid_until ||
          null,
        customer_reference:
          formData.customer_reference ||
          null,
        notes:
          formData.notes ||
          null,
        terms:
          formData.terms ||
          null,
      })
      .eq("id", quotationId)
      .eq("company_id", companyId)
      .eq("status", "draft")
      .select(quotationColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteQuotation(
  quotationId: string,
  companyId: string
): Promise<void> {
  const { error } =
    await supabase
      .from("quotation")
      .delete()
      .eq("id", quotationId)
      .eq("company_id", companyId)
      .eq("status", "draft");

  if (error) {
    throw new Error(error.message);
  }
}

export async function addQuotationItem(
  quotationId: string,
  companyId: string,
  formData: QuotationItemFormData
): Promise<QuotationItem> {
  const { data, error } =
    await supabase
      .from("quotation_item")
      .insert({
        quotation_id:
          quotationId,
        company_id:
          companyId,
        inventory_item_id:
          formData.inventory_item_id,
        description:
          formData.description,
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
        quotationItemColumns
      )
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateQuotationItem(
  quotationItemId: string,
  companyId: string,
  formData: QuotationItemFormData
): Promise<QuotationItem> {
  const { data, error } =
    await supabase
      .from("quotation_item")
      .update({
        inventory_item_id:
          formData.inventory_item_id,
        description:
          formData.description,
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
      .eq(
        "id",
        quotationItemId
      )
      .eq(
        "company_id",
        companyId
      )
      .select(
        quotationItemColumns
      )
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteQuotationItem(
  quotationItemId: string,
  companyId: string
): Promise<void> {
  const { error } =
    await supabase
      .from("quotation_item")
      .delete()
      .eq(
        "id",
        quotationItemId
      )
      .eq(
        "company_id",
        companyId
      );

  if (error) {
    throw new Error(error.message);
  }
}

export async function changeQuotationStatus(
  quotationId: string,
  companyId: string,
  status: QuotationStatus
): Promise<Quotation> {
  const { data, error } =
    await supabase
      .from("quotation")
      .update({
        status,
      })
      .eq(
        "id",
        quotationId
      )
      .eq(
        "company_id",
        companyId
      )
      .select(
        quotationColumns
      )
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
