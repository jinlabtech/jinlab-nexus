"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNexusUiState } from "@/hooks/useNexusUiState";

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
  ] = useNexusUiState(
    "sales:orders:search",
    ""
  );

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

      <main className="nexus-module-screen p-3 md:p-6 lg:p-8">
        <section className="mb-3 flex items-center justify-between gap-2 md:mb-8 md:items-start">
          <div className="hidden md:block">
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

          <div className="flex w-full gap-2 md:w-auto md:flex-wrap md:gap-3">
            <Link
              href="/quotations"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border bg-background px-3 text-xs font-medium md:h-9 md:flex-none md:rounded-md md:px-4 md:text-sm"
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

        <section className="mb-6 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
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

        <section className="sticky top-0 z-20 mb-3 flex flex-col gap-3 border-b border-border/40 bg-background/95 px-0 py-3 backdrop-blur-xl md:static md:mb-5 md:flex-row md:items-center md:justify-between md:rounded-xl md:border md:bg-card md:p-4 md:backdrop-blur-none">
          <div className="hidden md:block">
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
            className="h-11 w-full rounded-xl border bg-background px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary/15 md:h-10 md:max-w-sm md:rounded-md md:px-3 md:text-sm"
          />
        </section>

        {loading ||
        permissionsLoading ? (
          <>
            {/* MOBILE LOADING */}
            <div className="space-y-3 md:hidden">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="animate-pulse rounded-2xl border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="h-4 w-28 rounded bg-muted" />
                      <div className="h-3 w-36 rounded bg-muted" />
                    </div>

                    <div className="h-6 w-20 rounded-full bg-muted" />
                  </div>

                  <div className="mt-5 h-5 w-24 rounded bg-muted" />
                </div>
              ))}
            </div>

            {/* DESKTOP LOADING */}
            <div className="hidden rounded-xl border p-10 text-center text-sm text-muted-foreground md:block">
              Loading sales orders...
            </div>
          </>
        ) : (
          <>
            {/* MOBILE SALES ORDERS */}
            <div className="space-y-3 md:hidden">

              {filteredSalesOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-card/50 px-5 py-10 text-center">
                  <p className="text-sm font-semibold">
                    No sales orders
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    No orders match your current search.
                  </p>
                </div>
              ) : (
                filteredSalesOrders.map((order) => {

                  const href =
                    `/sales/${order.id}`;

                  const customer =
                    customerMap.get(
                      order.customer_id
                    ) ?? "Customer";

                  return (
                    <Link
                      key={order.id}
                      href={href}
                      prefetch={false}
                      onPointerEnter={() =>
                        router.prefetch(
                          href
                        )
                      }
                      onTouchStart={() =>
                        router.prefetch(
                          href
                        )
                      }
                      className="group block rounded-2xl border border-border/55 bg-card p-4 shadow-sm transition active:scale-[0.985] active:bg-muted/40"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">

                          <p className="truncate text-[15px] font-bold tracking-tight">
                            {order.sales_order_number}
                          </p>

                          <p className="mt-1 truncate text-[13px] text-muted-foreground">
                            {customer}
                          </p>

                        </div>


                        <span className="shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10px] font-semibold">
                          {formatStatus(
                            order.status
                          )}
                        </span>

                      </div>


                      <div className="mt-4 flex items-end justify-between gap-4">

                        <div>

                          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            Total
                          </p>

                          <p className="mt-0.5 text-lg font-bold tracking-tight">
                            {formatCurrency(
                              Number(
                                order.total_amount
                              )
                            )}
                          </p>

                        </div>


                        <div className="text-right">

                          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            Order date
                          </p>

                          <p className="mt-0.5 text-xs font-medium">
                            {order.order_date}
                          </p>

                        </div>

                      </div>


                      {order.expected_delivery ? (
                        <div className="mt-3 border-t border-border/35 pt-3">

                          <p className="text-[11px] text-muted-foreground">
                            Expected delivery{" "}
                            <span className="font-medium text-foreground">
                              {order.expected_delivery}
                            </span>
                          </p>

                        </div>
                      ) : null}

                    </Link>
                  );

                })
              )}

            </div>


            {/* DESKTOP SALES TABLE */}
            <div className="hidden md:block">

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

            </div>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
