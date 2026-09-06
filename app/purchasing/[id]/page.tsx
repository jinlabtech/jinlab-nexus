"use client";

import ActionModal from "@/components/ui/ActionModal";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  useParams,
  useRouter,
} from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import PurchaseOrderItemForm from "@/components/PurchaseOrderItemForm";
import ReceivePurchaseOrderForm from "@/components/ReceivePurchaseOrderForm";
import { Button } from "@/components/ui/button";

import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";

import {
  addPurchaseOrderItem,
  changePurchaseOrderStatus,
  deletePurchaseOrderItem,
  getPurchaseOrder,
  receivePurchaseOrderTransactional,
  updatePurchaseOrderItem,
} from "@/lib/services/purchasingService";

import { supabase } from "@/lib/supabase";

import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderItemFormData,
  ReceivePurchaseOrderData,
} from "@/types/purchasing";

function formatCurrency(
  value: number
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(value);
}

function statusLabel(
  value: string
) {
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();

  const purchaseOrderId =
    String(params.id);

  const [
    currentCompanyId,
    setCurrentCompanyId,
  ] = useState("");

  const [
    companyName,
    setCompanyName,
  ] = useState("JINLAB");

  const [
    userName,
    setUserName,
  ] = useState("JINLAB Admin");

  const [
    order,
    setOrder,
  ] =
    useState<PurchaseOrder | null>(
      null
    );

  const [
    orderItems,
    setOrderItems,
  ] = useState<
    PurchaseOrderItem[]
  >([]);

  const [
    showItemForm,
    setShowItemForm,
  ] = useState(false);

  const [
    showReceiveForm,
    setShowReceiveForm,
  ] = useState(false);

  const [
    editingItem,
    setEditingItem,
  ] =
    useState<PurchaseOrderItem | null>(
      null
    );

  const [
    loadingOrder,
    setLoadingOrder,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState("");

  const {
    items: inventoryItems,
  } = useInventory(
    currentCompanyId
  );

  const {
    can,
    loading:
      permissionsLoading,
    errorMessage:
      permissionsError,
  } = usePermissions();

  useEffect(() => {
    async function initialisePage() {
      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        router.replace(
          "/login"
        );
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from(
          "user_profile"
        )
        .select(
          "full_name, company_id"
        )
        .eq(
          "user_id",
          user.id
        )
        .single();

      if (
        profileError ||
        !profile
      ) {
        setPageError(
          profileError?.message ??
            "Profile could not be loaded."
        );
        return;
      }

      setUserName(
        profile.full_name
      );

      if (
        !profile.company_id
      ) {
        setPageError(
          "Your account is not linked to a company."
        );
        return;
      }

      setCurrentCompanyId(
        profile.company_id
      );

      const {
        data: company,
      } = await supabase
        .from("company")
        .select(
          "company_name"
        )
        .eq(
          "id",
          profile.company_id
        )
        .single();

      if (
        company?.company_name
      ) {
        setCompanyName(
          company.company_name
        );
      }
    }

    initialisePage();
  }, [router]);

  async function refreshOrder() {
    if (
      !currentCompanyId ||
      !purchaseOrderId
    ) {
      return;
    }

    setLoadingOrder(true);
    setPageError("");

    try {
      const result =
        await getPurchaseOrder(
          purchaseOrderId,
          currentCompanyId
        );

      setOrder(
        result.order
      );

      setOrderItems(
        result.items
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Purchase order could not be loaded."
      );
    } finally {
      setLoadingOrder(false);
    }
  }

  useEffect(() => {
    refreshOrder();
  }, [
    currentCompanyId,
    purchaseOrderId,
  ]);

  const inventoryMap =
    useMemo(() => {
      return new Map(
        inventoryItems.map(
          (item) => [
            item.id,
            item,
          ]
        )
      );
    }, [inventoryItems]);

  function openAddItem() {
    if (
      !can(
        "purchasing.update"
      )
    ) {
      setPageError(
        "You do not have permission to modify purchase orders."
      );
      return;
    }

    setEditingItem(null);
    setShowItemForm(true);
    setMessage("");
    setPageError("");
  }

  function openEditItem(
    item: PurchaseOrderItem
  ) {
    if (
      !can(
        "purchasing.update"
      )
    ) {
      return;
    }

    setEditingItem(item);
    setShowItemForm(true);
    setMessage("");
    setPageError("");
  }

  function closeItemForm() {
    setShowItemForm(false);
    setEditingItem(null);
  }

  async function saveOrderItem(
    data: PurchaseOrderItemFormData
  ) {
    if (
      !currentCompanyId
    ) {
      throw new Error(
        "Company could not be identified."
      );
    }

    if (
      !order ||
      order.status !==
        "draft"
    ) {
      throw new Error(
        "Only draft purchase orders can be modified."
      );
    }

    if (editingItem) {
      const updated =
        await updatePurchaseOrderItem(
          editingItem.id,
          currentCompanyId,
          data
        );

      try {
        await createAuditLog({
          company_id:
            currentCompanyId,

          action:
            "update",

          module:
            "purchasing",

          record_id:
            updated.id,

          description:
            `Updated item on purchase order ${order.purchase_order_number}`,

          metadata: {
            inventory_item_id:
              updated.inventory_item_id,

            quantity_ordered:
              updated.quantity_ordered,

            unit_cost:
              updated.unit_cost,

            tax_rate:
              updated.tax_rate,
          },
        });
      } catch {
        // Do not block PO editing
        // because of audit failure.
      }

      setMessage(
        "Purchase order item updated."
      );
    } else {
      const created =
        await addPurchaseOrderItem(
          order.id,
          currentCompanyId,
          data
        );

      try {
        await createAuditLog({
          company_id:
            currentCompanyId,

          action:
            "create",

          module:
            "purchasing",

          record_id:
            created.id,

          description:
            `Added item to purchase order ${order.purchase_order_number}`,

          metadata: {
            inventory_item_id:
              created.inventory_item_id,

            quantity_ordered:
              created.quantity_ordered,

            unit_cost:
              created.unit_cost,

            tax_rate:
              created.tax_rate,
          },
        });
      } catch {
        // Audit logging should not
        // block the purchasing flow.
      }

      setMessage(
        "Item added to purchase order."
      );
    }

    closeItemForm();
    await refreshOrder();
  }

  async function removeOrderItem(
    item: PurchaseOrderItem
  ) {
    if (
      !order ||
      order.status !==
        "draft"
    ) {
      return;
    }

    const inventoryItem =
      inventoryMap.get(
        item.inventory_item_id
      );

    const confirmed =
      window.confirm(
        `Remove "${
          inventoryItem?.item_name ??
          "this item"
        }" from the purchase order?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deletePurchaseOrderItem(
        item.id,
        currentCompanyId
      );

      setMessage(
        "Purchase order item removed."
      );

      await refreshOrder();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Item could not be removed."
      );
    }
  }

  async function submitOrder() {
    if (!order) {
      return;
    }

    if (
      orderItems.length === 0
    ) {
      setPageError(
        "Add at least one item before submitting the purchase order."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Submit ${order.purchase_order_number}? You will no longer be able to edit its lines as a draft.`
      );

    if (!confirmed) {
      return;
    }

    try {
      const updated =
        await changePurchaseOrderStatus(
          order.id,
          currentCompanyId,
          "submitted"
        );

      setOrder(updated);

      setMessage(
        `${updated.purchase_order_number} submitted successfully.`
      );

      await createAuditLog({
        company_id:
          currentCompanyId,

        action:
          "update",

        module:
          "purchasing",

        record_id:
          updated.id,

        description:
          `Submitted purchase order: ${updated.purchase_order_number}`,

        metadata: {
          status:
            updated.status,

          total_amount:
            updated.total_amount,
        },
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Purchase order could not be submitted."
      );
    }
  }

  async function approveOrder() {
    if (!order) {
      return;
    }

    try {
      const updated =
        await changePurchaseOrderStatus(
          order.id,
          currentCompanyId,
          "approved"
        );

      setOrder(updated);

      setMessage(
        `${updated.purchase_order_number} approved.`
      );

      await createAuditLog({
        company_id:
          currentCompanyId,

        action:
          "update",

        module:
          "purchasing",

        record_id:
          updated.id,

        description:
          `Approved purchase order: ${updated.purchase_order_number}`,

        metadata: {
          status:
            updated.status,
        },
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Purchase order could not be approved."
      );
    }
  }

  function openReceiveForm() {
    if (
      !can(
        "purchasing.receive"
      )
    ) {
      setPageError(
        "You do not have permission to receive purchase orders."
      );
      return;
    }

    if (
      !order ||
      ![
        "approved",
        "partially_received",
      ].includes(
        order.status
      )
    ) {
      setPageError(
        "Only approved purchase orders can receive stock."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setShowItemForm(false);
    setShowReceiveForm(true);
  }

  function closeReceiveForm() {
    setShowReceiveForm(false);
  }

  async function receiveGoods(
    data: ReceivePurchaseOrderData
  ) {
    if (
      !order ||
      !currentCompanyId
    ) {
      throw new Error(
        "Purchase order could not be identified."
      );
    }

    const result =
      await receivePurchaseOrderTransactional(
        order.id,
        currentCompanyId,
        data
      );

    try {
      await createAuditLog({
        company_id:
          currentCompanyId,

        action:
          "update",

        module:
          "purchasing",

        record_id:
          order.id,

        description:
          `Received goods for purchase order ${order.purchase_order_number}`,

        metadata: {
          receipt_number:
            result.receipt_number,

          purchase_order_number:
            order.purchase_order_number,

          status:
            result.status,

          supplier_delivery_reference:
            data.supplier_delivery_reference ||
            null,
        },
      });
    } catch {
      // Receiving must not be reversed
      // because an audit entry failed.
    }

    setShowReceiveForm(false);

    setMessage(
      `Goods received successfully. GRN: ${result.receipt_number}`
    );

    await refreshOrder();
  }

  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }

  const rows =
    orderItems.map(
      (item) => {
        const inventoryItem =
          inventoryMap.get(
            item.inventory_item_id
          );

        return [
          <div
            key={`${item.id}-product`}
          >
            <p className="font-semibold">
              {inventoryItem?.item_name ??
                "Unknown Item"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              SKU: {" "}
              {inventoryItem?.sku ??
                "-"}
            </p>
          </div>,

          item.quantity_ordered,

          item.quantity_received,

          formatCurrency(
            Number(
              item.unit_cost
            )
          ),

          `${Number(
            item.tax_rate
          ).toFixed(1)}%`,

          formatCurrency(
            Number(
              item.line_subtotal
            )
          ),

          formatCurrency(
            Number(
              item.line_tax
            )
          ),

          formatCurrency(
            Number(
              item.line_total
            )
          ),

          <div
            key={`${item.id}-actions`}
            className="flex flex-wrap gap-2"
          >
            {order?.status ===
              "draft" &&
              can(
                "purchasing.update"
              ) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openEditItem(
                      item
                    )
                  }
                >
                  Edit
                </Button>
              )}

            {order?.status ===
              "draft" &&
              can(
                "purchasing.update"
              ) && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    removeOrderItem(
                      item
                    )
                  }
                >
                  Remove
                </Button>
              )}
          </div>,
        ];
      }
    );

  const visibleError =
    pageError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can(
      "purchasing.view"
    )
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName={
            userName
          }
          onLogout={logout}
        />

        <main className="p-8">
          Access denied.
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={
          companyName
        }
        userName={
          userName
        }
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link
              href="/purchasing"
              className="text-sm font-medium text-primary"
            >
              ← Purchase Orders
            </Link>

            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {order?.purchase_order_number ??
                "Purchase Order"}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {order && (
                <span className="rounded-full border px-3 py-1 text-sm font-medium">
                  {statusLabel(
                    order.status
                  )}
                </span>
              )}

              {order && (
                <span className="text-sm text-muted-foreground">
                  Order date: {" "}
                  {order.order_date}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {order?.status ===
              "draft" &&
              can(
                "purchasing.update"
              ) &&
              !showItemForm && (
                <Button
                  type="button"
                  onClick={
                    openAddItem
                  }
                >
                  + Add Product
                </Button>
              )}

            {order?.status ===
              "draft" &&
              can(
                "purchasing.submit"
              ) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={
                    submitOrder
                  }
                >
                  Submit PO
                </Button>
              )}

            {order?.status ===
              "submitted" &&
              can(
                "purchasing.approve"
              ) && (
                <Button
                  type="button"
                  onClick={
                    approveOrder
                  }
                >
                  Approve PO
                </Button>
              )}

            {order &&
              [
                "approved",
                "partially_received",
              ].includes(
                order.status
              ) &&
              can(
                "purchasing.receive"
              ) &&
              !showReceiveForm && (
                <Button
                  type="button"
                  onClick={
                    openReceiveForm
                  }
                >
                  Receive Stock
                </Button>
              )}
          </div>
        </section>

        {message && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {visibleError}
          </div>
        )}

        <ActionModal
          open={showItemForm}
          title={
            editingItem
              ? "Edit Purchase Item"
              : "Add Product"
          }
          subtitle="Add a product to this purchase order."
          onClose={closeItemForm}
          maxWidth="max-w-3xl"
        >
          <PurchaseOrderItemForm
            inventoryItems={
              inventoryItems
            }
            item={
              editingItem
            }
            onSave={
              saveOrderItem
            }
            onCancel={
              closeItemForm
            }
          />
        </ActionModal>

        {showReceiveForm &&
          order && (
            <div className="mb-8">
              <ReceivePurchaseOrderForm
                orderNumber={
                  order.purchase_order_number
                }
                orderItems={
                  orderItems
                }
                inventoryItems={
                  inventoryItems
                }
                onSave={
                  receiveGoods
                }
                onCancel={
                  closeReceiveForm
                }
              />
            </div>
          )}

        {order && (
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Subtotal
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  Number(
                    order.subtotal
                  )
                )}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                VAT
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  Number(
                    order.tax_amount
                  )
                )}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                PO Total
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  Number(
                    order.total_amount
                  )
                )}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Products
              </p>

              <p className="mt-2 text-2xl font-bold">
                {orderItems.length}
              </p>
            </div>
          </section>
        )}

        {loadingOrder ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading purchase order...
          </div>
        ) : (
          <DataTable
            headers={[
              "Product",
              "Ordered",
              "Received",
              "Unit Cost",
              "VAT",
              "Subtotal",
              "Tax",
              "Total",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No products have been added to this purchase order."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
