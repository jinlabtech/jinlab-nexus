import { supabase } from "@/lib/supabase";

import type {
  PurchaseOrder,
  PurchaseOrderFormData,
  PurchaseOrderItem,
  PurchaseOrderItemFormData,
  PurchaseOrderStatus,
  PurchaseOrderWithItems,
  PurchaseReceipt,
  PurchaseReceiptItem,
  ReceivePurchaseOrderData,
} from "@/types/purchasing";

const purchaseOrderColumns =
  "id, company_id, supplier_id, branch_id, created_by, purchase_order_number, status, order_date, expected_date, supplier_reference, notes, subtotal, tax_amount, total_amount, created_at, updated_at";

const purchaseOrderItemColumns =
  "id, purchase_order_id, company_id, inventory_item_id, quantity_ordered, quantity_received, unit_cost, tax_rate, line_subtotal, line_tax, line_total, created_at";

const purchaseReceiptColumns =
  "id, company_id, purchase_order_id, branch_id, received_by, receipt_number, supplier_delivery_reference, notes, received_at, created_at";

const purchaseReceiptItemColumns =
  "id, purchase_receipt_id, purchase_order_item_id, company_id, inventory_item_id, quantity_received, unit_cost, created_at";

export async function getPurchaseOrders(
  companyId: string
): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from("purchase_order")
    .select(purchaseOrderColumns)
    .eq("company_id", companyId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getPurchaseOrder(
  purchaseOrderId: string,
  companyId: string
): Promise<PurchaseOrderWithItems> {
  const {
    data: order,
    error: orderError,
  } = await supabase
    .from("purchase_order")
    .select(purchaseOrderColumns)
    .eq("id", purchaseOrderId)
    .eq("company_id", companyId)
    .single();

  if (orderError) {
    throw new Error(orderError.message);
  }

  const {
    data: items,
    error: itemsError,
  } = await supabase
    .from("purchase_order_item")
    .select(purchaseOrderItemColumns)
    .eq(
      "purchase_order_id",
      purchaseOrderId
    )
    .eq("company_id", companyId)
    .order("created_at");

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  return {
    order,
    items: items ?? [],
  };
}

export async function createPurchaseOrder(
  companyId: string,
  formData: PurchaseOrderFormData
): Promise<PurchaseOrder> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      userError?.message ??
        "An authenticated user is required."
    );
  }

  const {
    data: generatedNumber,
    error: numberError,
  } = await supabase.rpc(
    "generate_purchase_order_number",
    {
      target_company_id: companyId,
    }
  );

  if (numberError) {
    throw new Error(numberError.message);
  }

  if (!generatedNumber) {
    throw new Error(
      "Purchase order number could not be generated."
    );
  }

  const { data, error } = await supabase
    .from("purchase_order")
    .insert({
      company_id: companyId,
      supplier_id: formData.supplier_id,
      branch_id: formData.branch_id,
      created_by: user.id,
      purchase_order_number:
        generatedNumber,
      status: "draft",
      expected_date:
        formData.expected_date ||
        null,
      supplier_reference:
        formData.supplier_reference ||
        null,
      notes:
        formData.notes ||
        null,
    })
    .select(purchaseOrderColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updatePurchaseOrder(
  purchaseOrderId: string,
  companyId: string,
  formData: PurchaseOrderFormData
): Promise<PurchaseOrder> {
  const { data, error } = await supabase
    .from("purchase_order")
    .update({
      supplier_id:
        formData.supplier_id,
      branch_id:
        formData.branch_id,
      expected_date:
        formData.expected_date ||
        null,
      supplier_reference:
        formData.supplier_reference ||
        null,
      notes:
        formData.notes ||
        null,
    })
    .eq("id", purchaseOrderId)
    .eq("company_id", companyId)
    .eq("status", "draft")
    .select(purchaseOrderColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deletePurchaseOrder(
  purchaseOrderId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("purchase_order")
    .delete()
    .eq("id", purchaseOrderId)
    .eq("company_id", companyId)
    .eq("status", "draft");

  if (error) {
    throw new Error(error.message);
  }
}

export async function addPurchaseOrderItem(
  purchaseOrderId: string,
  companyId: string,
  formData: PurchaseOrderItemFormData
): Promise<PurchaseOrderItem> {
  const { data, error } = await supabase
    .from("purchase_order_item")
    .insert({
      purchase_order_id:
        purchaseOrderId,
      company_id:
        companyId,
      inventory_item_id:
        formData.inventory_item_id,
      quantity_ordered:
        formData.quantity_ordered,
      unit_cost:
        formData.unit_cost,
      tax_rate:
        formData.tax_rate,
    })
    .select(purchaseOrderItemColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updatePurchaseOrderItem(
  purchaseOrderItemId: string,
  companyId: string,
  formData: PurchaseOrderItemFormData
): Promise<PurchaseOrderItem> {
  const { data, error } = await supabase
    .from("purchase_order_item")
    .update({
      inventory_item_id:
        formData.inventory_item_id,
      quantity_ordered:
        formData.quantity_ordered,
      unit_cost:
        formData.unit_cost,
      tax_rate:
        formData.tax_rate,
    })
    .eq(
      "id",
      purchaseOrderItemId
    )
    .eq(
      "company_id",
      companyId
    )
    .select(
      purchaseOrderItemColumns
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deletePurchaseOrderItem(
  purchaseOrderItemId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("purchase_order_item")
    .delete()
    .eq(
      "id",
      purchaseOrderItemId
    )
    .eq(
      "company_id",
      companyId
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function changePurchaseOrderStatus(
  purchaseOrderId: string,
  companyId: string,
  status: PurchaseOrderStatus
): Promise<PurchaseOrder> {
  const { data, error } = await supabase
    .from("purchase_order")
    .update({
      status,
    })
    .eq("id", purchaseOrderId)
    .eq("company_id", companyId)
    .select(purchaseOrderColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getPurchaseReceipts(
  companyId: string,
  purchaseOrderId?: string
): Promise<PurchaseReceipt[]> {
  let query = supabase
    .from("purchase_receipt")
    .select(purchaseReceiptColumns)
    .eq("company_id", companyId)
    .order("received_at", {
      ascending: false,
    });

  if (purchaseOrderId) {
    query = query.eq(
      "purchase_order_id",
      purchaseOrderId
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getPurchaseReceiptItems(
  companyId: string,
  purchaseReceiptId: string
): Promise<PurchaseReceiptItem[]> {
  const { data, error } = await supabase
    .from("purchase_receipt_item")
    .select(purchaseReceiptItemColumns)
    .eq(
      "purchase_receipt_id",
      purchaseReceiptId
    )
    .eq("company_id", companyId)
    .order("created_at");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function receivePurchaseOrder(
  purchaseOrderId: string,
  companyId: string,
  branchId: string,
  data: ReceivePurchaseOrderData
): Promise<PurchaseReceipt> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      userError?.message ??
        "An authenticated user is required."
    );
  }

  if (data.items.length === 0) {
    throw new Error(
      "At least one received item is required."
    );
  }

  const {
    data: receiptNumber,
    error: numberError,
  } = await supabase.rpc(
    "generate_purchase_receipt_number",
    {
      target_company_id: companyId,
    }
  );

  if (numberError) {
    throw new Error(
      numberError.message
    );
  }

  const {
    data: receipt,
    error: receiptError,
  } = await supabase
    .from("purchase_receipt")
    .insert({
      company_id: companyId,
      purchase_order_id:
        purchaseOrderId,
      branch_id: branchId,
      received_by: user.id,
      receipt_number:
        receiptNumber,
      supplier_delivery_reference:
        data.supplier_delivery_reference ||
        null,
      notes:
        data.notes ||
        null,
    })
    .select(
      purchaseReceiptColumns
    )
    .single();

  if (receiptError) {
    throw new Error(
      receiptError.message
    );
  }

  for (const receivedItem of data.items) {
    const {
      data: orderItem,
      error: orderItemError,
    } = await supabase
      .from("purchase_order_item")
      .select(
        "id, quantity_ordered, quantity_received"
      )
      .eq(
        "id",
        receivedItem.purchase_order_item_id
      )
      .eq(
        "company_id",
        companyId
      )
      .single();

    if (
      orderItemError ||
      !orderItem
    ) {
      throw new Error(
        orderItemError?.message ??
          "Purchase order item could not be found."
      );
    }

    const remaining =
      orderItem.quantity_ordered -
      orderItem.quantity_received;

    if (
      receivedItem.quantity_received >
      remaining
    ) {
      throw new Error(
        "Received quantity cannot exceed the remaining ordered quantity."
      );
    }

    const {
      error: receiptItemError,
    } = await supabase
      .from(
        "purchase_receipt_item"
      )
      .insert({
        purchase_receipt_id:
          receipt.id,
        purchase_order_item_id:
          receivedItem.purchase_order_item_id,
        company_id:
          companyId,
        inventory_item_id:
          receivedItem.inventory_item_id,
        quantity_received:
          receivedItem.quantity_received,
        unit_cost:
          receivedItem.unit_cost,
      });

    if (receiptItemError) {
      throw new Error(
        receiptItemError.message
      );
    }

    const newReceivedQuantity =
      orderItem.quantity_received +
      receivedItem.quantity_received;

    const {
      error: updateItemError,
    } = await supabase
      .from(
        "purchase_order_item"
      )
      .update({
        quantity_received:
          newReceivedQuantity,
      })
      .eq(
        "id",
        receivedItem.purchase_order_item_id
      )
      .eq(
        "company_id",
        companyId
      );

    if (updateItemError) {
      throw new Error(
        updateItemError.message
      );
    }

    const {
      data: stockRow,
      error: stockReadError,
    } = await supabase
      .from("branch_stock")
      .select("id, quantity")
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "branch_id",
        branchId
      )
      .eq(
        "inventory_item_id",
        receivedItem.inventory_item_id
      )
      .maybeSingle();

    if (stockReadError) {
      throw new Error(
        stockReadError.message
      );
    }

    if (stockRow) {
      const {
        error: stockUpdateError,
      } = await supabase
        .from("branch_stock")
        .update({
          quantity:
            stockRow.quantity +
            receivedItem.quantity_received,
        })
        .eq(
          "id",
          stockRow.id
        )
        .eq(
          "company_id",
          companyId
        );

      if (stockUpdateError) {
        throw new Error(
          stockUpdateError.message
        );
      }
    } else {
      const {
        error: stockInsertError,
      } = await supabase
        .from("branch_stock")
        .insert({
          company_id:
            companyId,
          branch_id:
            branchId,
          inventory_item_id:
            receivedItem.inventory_item_id,
          quantity:
            receivedItem.quantity_received,
        });

      if (stockInsertError) {
        throw new Error(
          stockInsertError.message
        );
      }
    }

    const {
      error: movementError,
    } = await supabase
      .from("stock_movement")
      .insert({
        company_id:
          companyId,
        branch_id:
          branchId,
        inventory_item_id:
          receivedItem.inventory_item_id,
        user_id:
          user.id,
        movement_type:
          "stock_in",
        quantity:
          receivedItem.quantity_received,
        reference:
          receipt.receipt_number,
        notes:
          `Received against purchase order ${purchaseOrderId}`,
      });

    if (movementError) {
      throw new Error(
        movementError.message
      );
    }
  }

  const {
    data: allItems,
    error: allItemsError,
  } = await supabase
    .from("purchase_order_item")
    .select(
      "quantity_ordered, quantity_received"
    )
    .eq(
      "purchase_order_id",
      purchaseOrderId
    )
    .eq(
      "company_id",
      companyId
    );

  if (allItemsError) {
    throw new Error(
      allItemsError.message
    );
  }

  const fullyReceived =
    (allItems ?? []).every(
      (item) =>
        item.quantity_received >=
        item.quantity_ordered
    );

  const partiallyReceived =
    (allItems ?? []).some(
      (item) =>
        item.quantity_received > 0
    );

  await changePurchaseOrderStatus(
    purchaseOrderId,
    companyId,
    fullyReceived
      ? "received"
      : partiallyReceived
        ? "partially_received"
        : "approved"
  );

  return receipt;
}
export type PurchaseReceiptResult = {
  receipt_id: string;
  receipt_number: string;
  purchase_order_id: string;
  status:
    | "approved"
    | "partially_received"
    | "received";
};

export async function receivePurchaseOrderTransactional(
  purchaseOrderId: string,
  companyId: string,
  data: ReceivePurchaseOrderData
): Promise<PurchaseReceiptResult> {
  if (!data.items.length) {
    throw new Error(
      "At least one received item is required."
    );
  }

  const receivedItems = data.items
    .filter(
      (item) =>
        item.quantity_received > 0
    )
    .map((item) => ({
      purchase_order_item_id:
        item.purchase_order_item_id,

      quantity_received:
        item.quantity_received,
    }));

  if (!receivedItems.length) {
    throw new Error(
      "Enter a quantity for at least one item."
    );
  }

  const {
    data: result,
    error,
  } = await supabase.rpc(
    "receive_purchase_order",
    {
      target_purchase_order_id:
        purchaseOrderId,

      target_company_id:
        companyId,

      supplier_delivery_reference:
        data.supplier_delivery_reference ||
        null,

      receipt_notes:
        data.notes ||
        null,

      received_items:
        receivedItems,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!result) {
    throw new Error(
      "Goods receipt was completed but no receipt information was returned."
    );
  }

  return result as PurchaseReceiptResult;
}