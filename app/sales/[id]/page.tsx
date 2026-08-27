"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import SalesOrderItemForm from "@/components/SalesOrderItemForm";
import { Button } from "@/components/ui/button";

import {
  addSalesOrderItem,
  deleteSalesOrderItem,
  getSalesOrder,
  updateSalesOrderItem,
  updateSalesOrderStatus,
} from "@/lib/services/salesService";

import { supabase } from "@/lib/supabase";

import type {
  Customer,
} from "@/types/customer";

import type {
  InventoryItem,
} from "@/types/inventory";

import type {
  SalesOrder,
  SalesOrderItem,
  SalesOrderItemFormData,
} from "@/types/sales";

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

function formatStatus(
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

export default function SalesOrderDetailPage() {
  const params = useParams();
  const router = useRouter();

  const salesOrderId =
    String(params.id);

  const [
    companyId,
    setCompanyId,
  ] = useState<string | null>(null);

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
  ] = useState<SalesOrder | null>(null);

  const [
    items,
    setItems,
  ] = useState<SalesOrderItem[]>([]);

  const [
    customer,
    setCustomer,
  ] = useState<Customer | null>(null);

  const [
    inventoryItems,
    setInventoryItems,
  ] = useState<InventoryItem[]>([]);

  const [
    editingItem,
    setEditingItem,
  ] = useState<SalesOrderItem | null>(null);

  const [
    showItemForm,
    setShowItemForm,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const loadOrder = useCallback(
    async (
      targetCompanyId: string
    ) => {
      const result =
        await getSalesOrder(
          salesOrderId,
          targetCompanyId
        );

      setOrder(
        result.sales_order
      );

      setItems(
        result.items
      );

      const {
        data: customerData,
        error: customerError,
      } = await supabase
        .from("customer")
        .select("*")
        .eq(
          "id",
          result.sales_order.customer_id
        )
        .eq(
          "company_id",
          targetCompanyId
        )
        .single();

      if (customerError) {
        throw new Error(
          customerError.message
        );
      }

      setCustomer(
        customerData as Customer
      );
    },
    [salesOrderId]
  );

  useEffect(() => {
    async function initialise() {
      try {
        setLoading(true);
        setErrorMessage("");

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
          .from("user_profile")
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
          !profile?.company_id
        ) {
          throw new Error(
            profileError?.message ??
              "Company could not be identified."
          );
        }

        const targetCompanyId =
          profile.company_id;

        setCompanyId(
          targetCompanyId
        );

        if (
          profile.full_name
        ) {
          setUserName(
            profile.full_name
          );
        }

        const [
          companyResult,
          inventoryResult,
        ] =
          await Promise.all([
            supabase
              .from("company")
              .select(
                "company_name"
              )
              .eq(
                "id",
                targetCompanyId
              )
              .single(),

            supabase
              .from("inventory_item")
              .select("*")
              .eq(
                "company_id",
                targetCompanyId
              )
              .eq(
                "is_active",
                true
              )
              .order(
                "item_name"
              ),
          ]);

        if (
          companyResult.error
        ) {
          throw new Error(
            companyResult.error.message
          );
        }

        if (
          inventoryResult.error
        ) {
          throw new Error(
            inventoryResult.error.message
          );
        }

        setCompanyName(
          companyResult.data.company_name
        );

        setInventoryItems(
          (inventoryResult.data ??
            []) as InventoryItem[]
        );

        await loadOrder(
          targetCompanyId
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Sales order could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    initialise();
  }, [
    router,
    loadOrder,
  ]);

  async function refresh() {
    if (!companyId) {
      return;
    }

    await loadOrder(
      companyId
    );
  }

  async function saveItem(
    data: SalesOrderItemFormData
  ) {
    if (!order) {
      return;
    }

    if (editingItem) {
      await updateSalesOrderItem(
        editingItem.id,
        data
      );
    } else {
      await addSalesOrderItem(
        order.id,
        data
      );
    }

    setEditingItem(null);
    setShowItemForm(false);

    await refresh();
  }

  async function removeItem(
    item: SalesOrderItem
  ) {
    if (
      !window.confirm(
        `Remove "${item.description}" from this sales order?`
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");

      await deleteSalesOrderItem(
        item.id
      );

      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Item could not be removed."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function changeStatus(
    status:
      | "confirmed"
      | "cancelled"
  ) {
    if (
      !companyId ||
      !order
    ) {
      return;
    }

    if (
      status ===
        "confirmed" &&
      items.length === 0
    ) {
      setErrorMessage(
        "Add at least one item before confirming this sales order."
      );
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");

      await updateSalesOrderStatus(
        order.id,
        companyId,
        status
      );

      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Sales order status could not be updated."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={companyName}
          userName={userName}
          onLogout={logout}
        />

        <main className="p-8 text-center text-sm text-muted-foreground">
          Loading sales order...
        </main>
      </DashboardLayout>
    );
  }

  if (
    errorMessage &&
    !order
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={companyName}
          userName={userName}
          onLogout={logout}
        />

        <main className="p-8">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            {errorMessage}
          </div>
        </main>
      </DashboardLayout>
    );
  }

  if (!order) {
    return null;
  }

  const editable =
    order.status === "draft";

  return (
    <DashboardLayout>
      <Navbar
        companyName={companyName}
        userName={userName}
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <button
          type="button"
          onClick={() =>
            router.push("/sales")
          }
          className="mb-5 text-sm font-medium text-primary hover:underline"
        >
          ← Sales Orders
        </button>

        <section className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Sales Order
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {order.sales_order_number}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium">
                {formatStatus(
                  order.status
                )}
              </span>

              {order.quotation_id && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/quotations/${order.quotation_id}`
                    )
                  }
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View Source Quotation
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {editable && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingItem(null);
                    setShowItemForm(true);
                  }}
                >
                  + Add Item
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    changeStatus(
                      "confirmed"
                    )
                  }
                  disabled={
                    actionLoading
                  }
                >
                  Confirm Order
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    changeStatus(
                      "cancelled"
                    )
                  }
                  disabled={
                    actionLoading
                  }
                >
                  Cancel Order
                </Button>
              </>
            )}

            {order.status ===
              "confirmed" && (
              <Button
                type="button"
                disabled
                title="Invoice conversion will be added in the next sprint."
              >
                Create Invoice
              </Button>
            )}
          </div>
        </section>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Customer
            </p>

            <p className="mt-2 font-semibold">
              {customer?.customer_name ??
                "-"}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Order Date
            </p>

            <p className="mt-2 font-semibold">
              {order.order_date}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Expected Delivery
            </p>

            <p className="mt-2 font-semibold">
              {order.expected_delivery ??
                "-"}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Grand Total
            </p>

            <p className="mt-2 text-xl font-bold">
              {formatCurrency(
                Number(
                  order.total_amount
                )
              )}
            </p>
          </div>
        </section>

        {showItemForm && editable && (
          <div className="mb-8">
            <SalesOrderItemForm
              inventoryItems={
                inventoryItems
              }
              item={editingItem}
              onSave={saveItem}
              onCancel={() => {
                setEditingItem(null);
                setShowItemForm(false);
              }}
            />
          </div>
        )}

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="text-lg font-semibold">
                Order Items
              </h2>

              <p className="text-sm text-muted-foreground">
                {items.length} item
                {items.length === 1
                  ? ""
                  : "s"}
              </p>
            </div>

            {editable &&
              !showItemForm && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingItem(null);
                    setShowItemForm(true);
                  }}
                >
                  + Add Item
                </Button>
              )}
          </div>

          {items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No items have been added to this sales order.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="p-4 text-left">
                      Description
                    </th>

                    <th className="p-4 text-right">
                      Qty
                    </th>

                    <th className="p-4 text-right">
                      Unit Price
                    </th>

                    <th className="p-4 text-right">
                      Discount
                    </th>

                    <th className="p-4 text-right">
                      Tax
                    </th>

                    <th className="p-4 text-right">
                      Total
                    </th>

                    {editable && (
                      <th className="p-4 text-right">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {items.map(
                    (item) => (
                      <tr
                        key={item.id}
                        className="border-b last:border-0"
                      >
                        <td className="p-4">
                          <p className="font-medium">
                            {item.description}
                          </p>
                        </td>

                        <td className="p-4 text-right">
                          {Number(
                            item.quantity
                          )}
                        </td>

                        <td className="p-4 text-right">
                          {formatCurrency(
                            Number(
                              item.unit_price
                            )
                          )}
                        </td>

                        <td className="p-4 text-right">
                          {item.discount_mode ===
                          "percentage"
                            ? `${Number(
                                item.discount_value
                              )}%`
                            : formatCurrency(
                                Number(
                                  item.discount_value
                                )
                              )}
                        </td>

                        <td className="p-4 text-right">
                          {item.tax_mode ===
                          "vat"
                            ? `VAT ${Number(
                                item.tax_rate
                              )}%`
                            : "No Tax"}
                        </td>

                        <td className="p-4 text-right font-semibold">
                          {formatCurrency(
                            Number(
                              item.line_total
                            )
                          )}
                        </td>

                        {editable && (
                          <td className="p-4">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setEditingItem(
                                    item
                                  );
                                  setShowItemForm(
                                    true
                                  );
                                }}
                              >
                                Edit
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                disabled={
                                  actionLoading
                                }
                                onClick={() =>
                                  removeItem(
                                    item
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 flex justify-end">
          <div className="w-full max-w-md rounded-xl border bg-card p-5">
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">
                Subtotal
              </span>

              <span>
                {formatCurrency(
                  Number(
                    order.subtotal
                  )
                )}
              </span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">
                Discount
              </span>

              <span>
                -
                {formatCurrency(
                  Number(
                    order.discount_amount
                  )
                )}
              </span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">
                Tax
              </span>

              <span>
                {formatCurrency(
                  Number(
                    order.tax_amount
                  )
                )}
              </span>
            </div>

            <div className="mt-2 flex justify-between border-t pt-4 text-xl font-bold">
              <span>Total</span>

              <span>
                {formatCurrency(
                  Number(
                    order.total_amount
                  )
                )}
              </span>
            </div>
          </div>
        </section>

        {order.notes && (
          <section className="mt-6 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Notes
            </h2>

            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {order.notes}
            </p>
          </section>
        )}
      </main>
    </DashboardLayout>
  );
}
