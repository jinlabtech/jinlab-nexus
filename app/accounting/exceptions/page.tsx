"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import DataTable from "@/components/DataTable";
import AccountingNav from "@/components/accounting/AccountingNav";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";

import {
  getAccountingPostingExceptions,
  retryAccountingPostingException,
} from "@/lib/services/accountingService";

import type {
  AccountingPostingException,
  AccountingPostingExceptionStatus,
} from "@/lib/services/accountingService";


type FilterStatus =
  | AccountingPostingExceptionStatus
  | "all";


function formatDate(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    `${value.slice(0, 10)}T00:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


function label(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}


export default function AccountingExceptionsPage() {
  const router =
    useRouter();

  const {
    can,
    loading:
      permissionsLoading,
  } = usePermissions();

  const canView =
    can("accounting.view");

  const canRetry =
    can(
      "accounting.journal.post"
    );

  const [
    companyId,
    setCompanyId,
  ] = useState("");

  const [
    companyName,
    setCompanyName,
  ] = useState(
    "JINLAB Nexus"
  );

  const [
    exceptions,
    setExceptions,
  ] = useState<
    AccountingPostingException[]
  >([]);

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<FilterStatus>(
    "open"
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    retryingId,
    setRetryingId,
  ] = useState<
    string | null
  >(null);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");


  async function loadData(
    silent = false
  ) {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      const {
        data: { user },
      } =
        await supabase.auth
          .getUser();

      if (!user) {
        router.replace(
          "/login"
        );
        return;
      }

      const {
        data: profile,
        error: profileError,
      } =
        await supabase
          .from("user_profile")
          .select("company_id")
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
          "Company profile could not be loaded."
        );
      }

      const currentCompanyId =
        profile.company_id;

      setCompanyId(
        currentCompanyId
      );

      const [
        companyResult,
        exceptionResult,
      ] =
        await Promise.all([
          supabase
            .from("company")
            .select(
              "company_name"
            )
            .eq(
              "id",
              currentCompanyId
            )
            .single(),

          getAccountingPostingExceptions(
            currentCompanyId,
            statusFilter
          ),
        ]);

      if (
        companyResult.error
      ) {
        throw new Error(
          companyResult
            .error.message
        );
      }

      setCompanyName(
        companyResult.data
          .company_name
      );

      setExceptions(
        exceptionResult
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Accounting exceptions could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  useEffect(() => {
    if (
      permissionsLoading
    ) {
      return;
    }

    if (!canView) {
      setLoading(false);
      return;
    }

    void loadData();
  }, [
    permissionsLoading,
    canView,
    statusFilter,
  ]);


  async function logout() {
    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  async function retryException(
    exception:
      AccountingPostingException
  ) {
    const confirmed =
      window.confirm(
        "Retry this accounting transaction?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setRetryingId(
        exception.id
      );

      setErrorMessage("");
      setMessage("");

      const result =
        await retryAccountingPostingException(
          exception.id
        );

      if (
        result.already_resolved
      ) {
        setMessage(
          "This issue was already resolved."
        );
      } else {
        setMessage(
          "Accounting transaction posted successfully."
        );
      }

      await loadData(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Accounting transaction could not be posted."
      );
    } finally {
      setRetryingId(null);
    }
  }


  async function openSource(
    exception:
      AccountingPostingException
  ) {
    try {
      setErrorMessage("");

      if (
        exception.source_type ===
        "invoice"
      ) {
        router.push(
          `/invoices/${exception.source_id}`
        );
        return;
      }

      if (
        exception.source_type ===
        "invoice_payment"
      ) {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "invoice_payment"
            )
            .select(
              "invoice_id"
            )
            .eq(
              "id",
              exception.source_id
            )
            .eq(
              "company_id",
              companyId
            )
            .single();

        if (error) {
          throw new Error(
            error.message
          );
        }

        router.push(
          `/invoices/${data.invoice_id}`
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Source transaction could not be opened."
      );
    }
  }


  if (
    permissionsLoading ||
    loading
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-7xl p-6 lg:p-8">
          <p className="text-sm text-muted-foreground">
            Loading accounting exceptions...
          </p>
        </main>
      </DashboardLayout>
    );
  }


  if (!canView) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-5xl p-6 lg:p-8">
          <div className="rounded-xl border p-6">
            <h1 className="text-xl font-bold">
              Accounting Restricted
            </h1>
          </div>
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
        userName="Admin"
        onLogout={logout}
      />

      <main className="mx-auto max-w-7xl p-6 lg:p-8">

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Accounting
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Unposted Transactions
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Review transactions that Nexus
              could not automatically post
              to the accounting ledger.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={
              refreshing
            }
            onClick={() =>
              void loadData(true)
            }
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </Button>
        </div>


        <AccountingNav />


        {errorMessage && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}


        {message && (
          <div className="mb-6 rounded-xl border bg-muted/30 p-4 text-sm">
            {message}
          </div>
        )}


        <section className="mb-8 grid gap-4 md:grid-cols-2">

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Transactions Displayed
            </p>

            <p className="mt-2 text-3xl font-bold">
              {exceptions.length}
            </p>
          </div>


          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Accounting Safety
            </p>

            <p className="mt-2 text-xl font-bold">
              {statusFilter ===
                "open" &&
              exceptions.length ===
                0
                ? "No Open Exceptions"
                : "Review Required"}
            </p>
          </div>

        </section>


        <section>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">

            <div>
              <h2 className="text-xl font-semibold">
                Posting Exceptions
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Each exception remains linked
                to its original transaction.
              </p>
            </div>


            <select
              value={
                statusFilter
              }
              onChange={
                (event) =>
                  setStatusFilter(
                    event.target
                      .value as FilterStatus
                  )
              }
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="open">
                Open issues
              </option>

              <option value="resolved">
                Resolved
              </option>

              <option value="all">
                All issues
              </option>
            </select>

          </div>


          <DataTable
            headers={[
              "Date",
              "Source",
              "Event",
              "Reason",
              "Details",
              "Status",
              "Actions",
            ]}
            rows={
              exceptions.map(
                (exception) => [
                  formatDate(
                    exception
                      .event_date
                  ),

                  label(
                    exception
                      .source_type
                  ),

                  label(
                    exception
                      .source_event
                  ),

                  label(
                    exception
                      .reason_code
                  ),

                  exception.message,

                  label(
                    exception.status
                  ),

                  <div
                    key={
                      exception.id
                    }
                    className="flex flex-wrap gap-2"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void openSource(
                          exception
                        )
                      }
                    >
                      Open Source
                    </Button>

                    {exception.status ===
                      "open" &&
                      canRetry && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          retryingId ===
                          exception.id
                        }
                        className="bg-black text-white hover:bg-black/85"
                        onClick={() =>
                          void retryException(
                            exception
                          )
                        }
                      >
                        {retryingId ===
                        exception.id
                          ? "Retrying..."
                          : "Retry Posting"}
                      </Button>
                    )}
                  </div>,
                ]
              )
            }
            emptyMessage={
              statusFilter ===
              "open"
                ? "No open accounting exceptions. Automatic accounting is posting normally."
                : "No accounting exceptions found."
            }
          />

        </section>


        <section className="mt-10 rounded-xl border bg-muted/20 p-5">
          <h2 className="font-semibold">
            Accounting Control
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            Nexus records failures instead
            of silently losing accounting
            events. Correct the underlying
            configuration and retry the
            posting from this workspace.
          </p>
        </section>

      </main>
    </DashboardLayout>
  );
}
