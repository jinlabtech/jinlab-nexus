"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useRouter,
} from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import { useCustomers } from "@/hooks/useCustomers";
import { useInvoices } from "@/hooks/useInvoices";

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

export default function InvoicesPage() {
  const router = useRouter();

  const [
    companyId,
    setCompanyId,
  ] =
    useState<string | null>(
      null
    );

  const [
    companyName,
    setCompanyName,
  ] = useState("JINLAB");

  const [
    userName,
    setUserName,
  ] = useState(
    "JINLAB Admin"
  );

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState("");

  const {
    invoices,
    loading,
    error:
      invoiceError,
  } = useInvoices(
    companyId
  );

  const {
    customers,
  } = useCustomers(
    companyId ?? ""
  );

  useEffect(() => {
    async function initialise() {
      try {
        const {
          data: {
            user,
          },
          error:
            userError,
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
          data:
            profile,
          error:
            profileError,
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
          !profile?.company_id
        ) {
          throw new Error(
            profileError
              ?.message ??
              "Company could not be identified."
          );
        }

        setCompanyId(
          profile.company_id
        );

        if (
          profile.full_name
        ) {
          setUserName(
            profile.full_name
          );
        }

        const {
          data:
            company,
          error:
            companyError,
        } = await supabase
          .from(
            "company"
          )
          .select(
            "company_name"
          )
          .eq(
            "id",
            profile.company_id
          )
          .single();

        if (
          companyError
        ) {
          throw new Error(
            companyError.message
          );
        }

        setCompanyName(
          company.company_name
        );
      } catch (error) {
        setPageError(
          error instanceof Error
            ? error.message
            : "Invoices page could not be loaded."
        );
      }
    }

    initialise();
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
          (
            customer
          ) => [
            customer.id,
            customer.customer_name,
          ]
        )
      );
    }, [customers]);

  const filtered =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return invoices;
      }

      return invoices.filter(
        (invoice) =>
          [
            invoice.invoice_number,
            invoice.status,
            customerMap.get(
              invoice.customer_id
            ),
          ].some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(
                  search
                )
          )
      );
    }, [
      invoices,
      searchTerm,
      customerMap,
    ]);

  const rows =
    filtered.map(
      (invoice) => [
        <Link
          key={
            `${invoice.id}-number`
          }
          href={
            `/invoices/${invoice.id}`
          }
          className="font-semibold text-primary hover:underline"
        >
          {
            invoice.invoice_number
          }
        </Link>,

        customerMap.get(
          invoice.customer_id
        ) ?? "-",

        <span
          key={
            `${invoice.id}-status`
          }
          className="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
        >
          {formatStatus(
            invoice.status
          )}
        </span>,

        invoice.invoice_date,

        invoice.due_date ??
          "-",

        formatCurrency(
          Number(
            invoice.total_amount
          )
        ),

        formatCurrency(
          Number(
            invoice.amount_paid
          )
        ),

        formatCurrency(
          Number(
            invoice.balance_due
          )
        ),

        <Link
          key={
            `${invoice.id}-open`
          }
          href={
            `/invoices/${invoice.id}`
          }
          className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium"
        >
          Open
        </Link>,
      ]
    );

  const visibleError =
    pageError ||
    invoiceError;

  return (
    <DashboardLayout>
      <Navbar
        companyName={
          companyName
        }
        userName={
          userName
        }
        onLogout={
          logout
        }
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Sales
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Invoices
            </h1>

            <p className="mt-2 text-muted-foreground">
              Track customer invoices, payments and outstanding balances.
            </p>
          </div>

          <Link
            href="/sales"
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
          >
            Sales Orders
          </Link>
        </section>

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {
              visibleError
            }
          </div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Total Invoices
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                invoices.length
              }
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Invoice Value
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                invoices.reduce(
                  (
                    total,
                    invoice
                  ) =>
                    total +
                    Number(
                      invoice.total_amount
                    ),
                  0
                )
              )}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Paid
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                invoices.reduce(
                  (
                    total,
                    invoice
                  ) =>
                    total +
                    Number(
                      invoice.amount_paid
                    ),
                  0
                )
              )}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Outstanding
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                invoices.reduce(
                  (
                    total,
                    invoice
                  ) =>
                    total +
                    Number(
                      invoice.balance_due
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
              Invoice Register
            </p>

            <p className="text-sm text-muted-foreground">
              {
                filtered.length
              }{" "}
              invoice
              {filtered.length ===
              1
                ? ""
                : "s"}
            </p>
          </div>

          <input
            type="search"
            value={
              searchTerm
            }
            onChange={(
              event
            ) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search invoices..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-sm"
          />
        </section>

        {loading ? (
          <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
            Loading invoices...
          </div>
        ) : (
          <DataTable
            headers={[
              "Invoice",
              "Customer",
              "Status",
              "Invoice Date",
              "Due Date",
              "Total",
              "Paid",
              "Balance",
              "Actions",
            ]}
            rows={
              rows
            }
            emptyMessage="No invoices yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
