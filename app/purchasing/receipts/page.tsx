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

import { useBranches } from "@/hooks/useBranches";
import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { usePurchasing } from "@/hooks/usePurchasing";

import { supabase } from "@/lib/supabase";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PurchaseReceiptsPage() {
  const router = useRouter();

  const [currentCompanyId, setCurrentCompanyId] = useState("");

  const [companyName, setCompanyName] = useState("JINLAB");

  const [userName, setUserName] = useState("JINLAB Admin");

  const [searchTerm, setSearchTerm] = useState("");

  const [pageError, setPageError] = useState("");

  const {
    receipts,
    purchaseOrders,
    loading,
    errorMessage: purchasingError,
  } = usePurchasing(currentCompanyId);

  const { suppliers } = useInventory(currentCompanyId);

  const { branches } = useBranches(currentCompanyId);

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
        setPageError(profileError?.message ?? "Profile could not be loaded.");
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

  async function logout() {
    await supabase.auth.signOut();

    router.replace("/login");
  }

  const branchMap = useMemo(() => {
    return new Map(branches.map((branch) => [branch.id, branch.branch_name]));
  }, [branches]);

  const orderMap = useMemo(() => {
    return new Map(purchaseOrders.map((order) => [order.id, order]));
  }, [purchaseOrders]);

  const supplierMap = useMemo(() => {
    return new Map(suppliers.map((supplier) => [supplier.id, supplier.supplier_name]));
  }, [suppliers]);

  const filteredReceipts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return receipts;
    }

    return receipts.filter((receipt) => {
      const order = orderMap.get(receipt.purchase_order_id);

      const supplierName = order ? supplierMap.get(order.supplier_id) : "";

      const branchName = branchMap.get(receipt.branch_id);

      return [
        receipt.receipt_number,
        receipt.supplier_delivery_reference,
        receipt.notes,
        order?.purchase_order_number,
        supplierName,
        branchName,
      ].some((value) => value?.toLowerCase().includes(search));
    });
  }, [receipts, searchTerm, orderMap, supplierMap, branchMap]);

  const rows = filteredReceipts.map((receipt) => {
    const order = orderMap.get(receipt.purchase_order_id);

    const supplierName = order ? supplierMap.get(order.supplier_id) : "-";

    return [
      <div key={`${receipt.id}-grn`}>
        <p className="font-semibold">{receipt.receipt_number}</p>

        <p className="mt-1 text-xs text-muted-foreground">Goods Received Note</p>
      </div>,

      order ? (
        <Link
          key={`${receipt.id}-po`}
          href={`/purchasing/${order.id}`}
          className="font-medium text-primary hover:underline"
        >
          {order.purchase_order_number}
        </Link>
      ) : (
        "-"
      ),

      supplierName ?? "-",

      branchMap.get(receipt.branch_id) ?? "-",

      receipt.supplier_delivery_reference || "-",

      formatDate(receipt.received_at),

      receipt.notes || "-",
    ];
  });

  const visibleError = pageError || purchasingError || permissionsError;

  if (!permissionsLoading && !can("purchasing.view")) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={companyName}
          userName={userName}
          onLogout={logout}
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            <h1 className="text-xl font-semibold">Access denied</h1>

            <p className="mt-2 text-sm text-muted-foreground">
              You do not have permission to view purchase receipts.
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
            <p className="text-sm font-medium text-primary">Purchasing</p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">Goods Receipts</h1>

            <p className="mt-2 text-muted-foreground">
              Review all stock received against supplier purchase orders.
            </p>
          </div>

          <Link
            href="/purchasing"
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
          >
            Purchase Orders
          </Link>
        </section>

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {visibleError}
          </div>
        )}

        <section className="mb-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">Total GRNs</p>

            <p className="mt-2 text-2xl font-bold">{receipts.length}</p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">Purchase Orders</p>

            <p className="mt-2 text-2xl font-bold">{purchaseOrders.length}</p>
          </div>
        </section>

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Goods Receipt History</p>

            <p className="text-sm text-muted-foreground">
              {filteredReceipts.length} receipt{filteredReceipts.length === 1 ? "" : "s"}
            </p>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search GRNs..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading || permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading goods receipts...
          </div>
        ) : (
          <DataTable
            headers={[
              "GRN",
              "Purchase Order",
              "Supplier",
              "Branch",
              "Delivery Reference",
              "Received",
              "Notes",
            ]}
            rows={rows}
            emptyMessage="No goods receipts have been created yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
