"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import PurchaseOrderForm from "@/components/PurchaseOrderForm";
import { Button } from "@/components/ui/button";

import { useBranches } from "@/hooks/useBranches";
import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { usePurchasing } from "@/hooks/usePurchasing";
import { usePurchasingAnalytics } from "@/hooks/usePurchasingAnalytics";

import { createAuditLog } from "@/lib/services/auditLogService";
import {
  createPurchaseOrder,
  deletePurchaseOrder,
} from "@/lib/services/purchasingService";
import { supabase } from "@/lib/supabase";

import type { PurchaseOrderFormData } from "@/types/purchasing";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(value);
}

function statusClass(status: string) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "submitted":
      return "bg-blue-100 text-blue-700";
    case "approved":
      return "bg-purple-100 text-purple-700";
    case "partially_received":
      return "bg-amber-100 text-amber-700";
    case "received":
      return "bg-emerald-100 text-emerald-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PurchasingPage() {
  const router = useRouter();

  const [currentCompanyId, setCurrentCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("JINLAB");
  const [userName, setUserName] = useState("JINLAB Admin");
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");

  const {
    purchaseOrders,
    loading,
    errorMessage: purchasingError,
    refreshPurchasing,
  } = usePurchasing(currentCompanyId);

  const {
    suppliers,
    items: inventoryItems,
    branchStock,
  } = useInventory(currentCompanyId);

  const {
    branches,
  } = useBranches(currentCompanyId);

  const {
    can,
    loading: permissionsLoading,
    errorMessage: permissionsError,
  } = usePermissions();

  useEffect(() => {
    async function initialisePage() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("user_profile")
        .select("full_name, company_id")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile) {
        setPageError(
          profileError?.message ?? "Profile could not be loaded."
        );
        return;
      }

      setUserName(profile.full_name);

      if (!profile.company_id) {
        setPageError("Your account is not linked to a company.");
        return;
      }

      setCurrentCompanyId(profile.company_id);

      const {
        data: company,
        error: companyError,
      } = await supabase
        .from("company")
        .select("company_name")
        .eq("id", profile.company_id)
        .single();

      if (companyError) {
        setPageError(companyError.message);
        return;
      }

      if (company?.company_name) {
        setCompanyName(company.company_name);
      }
    }

    initialisePage();
  }, [router]);

  async function createOrder(
    data: PurchaseOrderFormData
  ) {
    if (!currentCompanyId) {
      throw new Error("Company could not be identified.");
    }

    if (!can("purchasing.create")) {
      throw new Error(
        "You do not have permission to create purchase orders."
      );
    }

    const order = await createPurchaseOrder(
      currentCompanyId,
      data
    );

    try {
      await createAuditLog({
        company_id: currentCompanyId,
        action: "create",
        module: "purchasing",
        record_id: order.id,
        description: `Created purchase order: ${order.purchase_order_number}`,
        metadata: {
          purchase_order_number: order.purchase_order_number,
          supplier_id: order.supplier_id,
          branch_id: order.branch_id,
        },
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? `Purchase order created, but audit logging failed: ${error.message}`
          : "Purchase order created, but audit logging failed."
      );
    }

    setShowForm(false);
    setMessage(`${order.purchase_order_number} created successfully.`);
    await refreshPurchasing();
  }

  async function removeOrder(
    orderId: string,
    orderNumber: string
  ) {
    if (!can("purchasing.delete")) {
      setPageError(
        "You do not have permission to delete purchase orders."
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete draft purchase order "${orderNumber}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deletePurchaseOrder(orderId, currentCompanyId);

      await createAuditLog({
        company_id: currentCompanyId,
        action: "delete",
        module: "purchasing",
        record_id: orderId,
        description: `Deleted purchase order: ${orderNumber}`,
        metadata: {
          purchase_order_number: orderNumber,
        },
      });

      setMessage(`${orderNumber} deleted successfully.`);
      await refreshPurchasing();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "The purchase order could not be deleted."
      );
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const supplierMap = useMemo(
    () =>
      new Map(
        suppliers.map((supplier) => [
          supplier.id,
          supplier.supplier_name,
        ])
      ),
    [suppliers]
  );

  const branchMap = useMemo(
    () =>
      new Map(
        branches.map((branch) => [
          branch.id,
          branch.branch_name,
        ])
      ),
    [branches]
  );

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return purchaseOrders;
    }

    return purchaseOrders.filter((order) =>
      [
        order.purchase_order_number,
        supplierMap.get(order.supplier_id),
        branchMap.get(order.branch_id),
        order.status,
        order.supplier_reference,
      ].some((value) =>
        value?.toLowerCase().includes(search)
      )
   );
  }, [
    purchaseOrders,
    searchTerm,
    supplierMap,
    branchMap,
  ]);

  const stockByItem = useMemo(() => {
    const map = new Map<string, number>();

    for (const stock of branchStock) {
      const current =
        map.get(
          stock.inventory_item_id
        ) ?? 0;

      map.set(
        stock.inventory_item_id,
        current + stock.quantity
      );
    }

    return map;
  }, [branchStock]);

  const analytics =
    usePurchasingAnalytics(
      purchaseOrders,
      inventoryItems,
      stockByItem
    );

  const rows = filteredOrders.map((order) => [
    <div key={`${order.id}-number`}>
      <Link
        href={`/purchasing/${order.id}`}
        className="font-semibold text-primary hover:underline"
      >
        {order.purchase_order_number}
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        {order.order_date}
      </p>
    </div>,

    supplierMap.get(order.supplier_id) ?? "-",
    branchMap.get(order.branch_id) ?? "-",

    <span
      key={`${order.id}-status`}
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(
        order.status
      )}`}
    >
      {statusLabel(order.status)}
    </span>,

    formatCurrency(Number(order.total_amount)),
    order.expected_date ?? "-",

    <div
      key={`${order.id}-actions`}
      className="flex flex-wrap gap-2"
    >
      {order.status === "draft" &&
        can("purchasing.delete") && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() =>
              removeOrder(
                order.id,
                order.purchase_order_number
              )
            }
          >
            Delete
          </Button>
        )}
    </div>,
  ]);

  const visibleError =
    pageError ||
    purchasingError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can("purchasing.view")
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={companyName}
          userName={userName}
          onLogout={logout}
        />

      <main className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
          <h1 className="text-xl font-semibold">
            Access denied
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            You do not have permission to view Purchasing.
          </p>
        </div>
      </main>
    </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={companyName}
        userName={userName}
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Procurement
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Purchase Orders
            </h1>

            <p className="mt-2 text-muted-foreground">
              Create and manage supplier purchase orders for {companyName}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/purchasing/recommendations"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Low Stock Recommendations
            </Link>

            <Link
              href="/purchasing/receipts"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Goods Receipts
            </Link>

            {can("purchasing.create") &&
              !showForm && (
                <Button
                type="button"
                onClick={() => {
                  setMessage("");
                  setPageError("");
                  setShowForm(true);
                }}
              >
                + New Purchase Order
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

        {showForm && (
          <div className="mb-8">
            <PurchaseOrderForm
              suppliers={suppliers}
              branches={branches}
              onSave={createOrder}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Total POs
            </p>

            <p className="mt-2 text-2xl font-bold">
              {analytics.totalOrders}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Approved / Outstanding
            </p>

            <p className="mt-2 text-2xl font-bold">
              {analytics.approvedOrders +
                analytics.partialOrders}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Outstanding Value
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                analytics.outstandingValue
              )}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Received Value
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                analytics.receivedValue
              )}
            </p>
          </div>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Draft
            </p>

            <p className="mt-2 text-xl font-bold">
              {analytics.draftOrders}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Submitted
            </p>

            <p className="mt-2 text-xl font-bold">
              {analytics.submittedOrders}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Partial Deliveries
            </p>

            <p className="mt-2 text-xl font-bold">
              {analytics.partialOrders}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Low Stock Items
            </p>

            <p className="mt-2 text-xl font-bold">
              {analytics.lowStockItems.length}
            </p>
          </div>
        </section>

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Purchase Orders
            </p>

            <p className="text-sm text-muted-foreground">
              {filteredOrders.length} order
              {filteredOrders.length === 1 ? "" : "s"}
            </p>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            placeholder="Search purchase orders..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading || permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading purchase orders...
          </div>
        ) : (
          <DataTable
            headers={[
              "PO Number",
              "Supplier",
              "Branch",
              "Status",
              "Total",
              "Expected",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No purchase orders yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
