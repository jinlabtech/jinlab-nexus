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
import { Button } from "@/components/ui/button";

import { useCustomers } from "@/hooks/useCustomers";
import { usePermissions } from "@/hooks/usePermissions";
import { useSalesOrders } from "@/hooks/useSalesOrders";

import { supabase } from "@/lib/supabase";

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

export default function SalesPage() {
  const router = useRouter();

  const [
    currentCompanyId,
    setCurrentCompanyId,
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
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState("");

  const {
    salesOrders,
    loading,
    error: salesError,
  } = useSalesOrders(
    currentCompanyId
  );

  const {
    customers,
  } = useCustomers(
    currentCompanyId ?? ""
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

  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }

  const customerMap =
    useMemo(() => {
      return new Map(
        customers.map(
          (customer) => [
            customer.id,
            customer.customer_name,
          ]
        )
      );
    }, [customers]);

  const filteredSalesOrders =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return salesOrders;
      }

      return salesOrders.filter(
        (order) =>
          [
            order.sales_order_number,
            order.status,
            customerMap.get(
              order.customer_id
            ),
          ].some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(search)
          )
      );
    }, [
      salesOrders,
      searchTerm,
      customerMap,
    ]);

  const rows =
    filteredSalesOrders.map(
      (order) => [
        <Link
          key={`${order.id}-number`}
          href={`/sales/${order.id}`}
          className="font-semibold text-primary hover:underline"
        >
          {
            order.sales_order_number
          }
        </Link>,

        customerMap.get(
          order.customer_id
        ) ?? "-",

        <span
          key={`${order.id}-status`}
          className="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
        >
          {formatStatus(
            order.status
          )}
        </span>,

        order.order_date,

        order.expected_delivery ??
          "-",

        formatCurrency(
          Number(
            order.total_amount
          )
        ),

        <Link
          key={`${order.id}-open`}
          href={`/sales/${order.id}`}
          className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium"
        >
          Open
        </Link>,
      ]
    );

  const visibleError =
    pageError ||
    salesError ||
    permissionsError;

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
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Sales
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Sales Orders
            </h1>

            <p className="mt-2 text-muted-foreground">
              Manage confirmed customer orders and prepare them for delivery and invoicing.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/quotations"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Quotations
            </Link>

            {can(
              "sales.create"
            ) && (
              <Button
                type="button"
                onClick={() =>
                  router.push(
                    "/sales/new"
                  )
                }
              >
                + New Sales Order
              </Button>
            )}
          </div>
        </section>

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {visibleError}
          </div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Total Orders
            </p>

            <p className="mt-2 text-2xl font-bold">
              {salesOrders.length}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Confirmed
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                salesOrders.filter(
                  (order) =>
                    order.status ===
                    "confirmed"
                ).length
              }
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Invoiced
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                salesOrders.filter(
                  (order) =>
                    order.status ===
                    "invoiced"
                ).length
              }
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Sales Value
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                salesOrders.reduce(
                  (total, order) =>
                    total +
                    Number(
                      order.total_amount
                    ),
                  0
                )
              )}
            </p>
          </div>
        </section>

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Sales Order Register
            </p>

            <p className="text-sm text-muted-foreground">
              {
                filteredSalesOrders.length
              }{" "}
              order
              {filteredSalesOrders.length ===
              1
                ? ""
                : "s"}
            </p>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search sales orders..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-sm"
          />
        </section>

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
            Loading sales orders...
          </div>
        ) : (
          <DataTable
            headers={[
              "Sales Order",
              "Customer",
              "Status",
              "Order Date",
              "Expected",
              "Total",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No sales orders yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
