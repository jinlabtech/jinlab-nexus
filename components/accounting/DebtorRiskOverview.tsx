"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  getDebtorRiskSummary,
} from "@/lib/services/accountingService";

import type {
  DebtorRiskCustomer,
  DebtorRiskLevel,
  DebtorRiskSummaryResult,
} from "@/lib/services/accountingService";


type Props = {
  asOfDate: string;
};


function formatCurrency(
  value: number
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }
  ).format(
    Number(value ?? 0)
  );
}


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


function riskLabel(
  value: DebtorRiskLevel
) {
  switch (value) {
    case "critical":
      return "Critical";

    case "high":
      return "High";

    case "elevated":
      return "Elevated";

    case "watch":
      return "Watch";

    case "due_today":
      return "Due Today";

    default:
      return "Current";
  }
}


function riskClass(
  value: DebtorRiskLevel
) {
  switch (value) {
    case "critical":
      return "border-destructive/40 bg-destructive/10 text-destructive";

    case "high":
      return "border-orange-300 bg-orange-50 text-orange-700";

    case "elevated":
      return "border-amber-300 bg-amber-50 text-amber-700";

    case "watch":
      return "border-yellow-300 bg-yellow-50 text-yellow-700";

    case "due_today":
      return "border-blue-300 bg-blue-50 text-blue-700";

    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}


export default function DebtorRiskOverview({
  asOfDate,
}: Props) {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<
      DebtorRiskSummaryResult |
      null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setErrorMessage("");

        const result =
          await getDebtorRiskSummary(
            asOfDate
          );

        if (active) {
          setData(result);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Debtor risk could not be loaded."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [
    asOfDate,
  ]);


  const priorityCustomers =
    useMemo(
      () =>
        (
          data?.customers ??
          []
        )
          .filter(
            (
              customer:
                DebtorRiskCustomer
            ) =>
              customer.risk_level !==
              "current"
          )
          .slice(
            0,
            8
          ),
      [
        data,
      ]
    );


  if (loading) {
    return (
      <section className="mb-8 rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Evaluating debtor risk...
        </p>
      </section>
    );
  }


  if (
    errorMessage ||
    !data
  ) {
    return (
      <section className="mb-8 rounded-xl border bg-card p-5">
        <p className="font-semibold">
          Debtor Risk
        </p>

        <p className="mt-2 text-sm text-destructive">
          {errorMessage ||
            "Risk information is unavailable."}
        </p>
      </section>
    );
  }


  return (
    <section className="mb-10">
      <div className="mb-4">
        <p className="text-sm font-medium text-primary">
          Credit Intelligence
        </p>

        <h2 className="mt-1 text-xl font-semibold">
          Debtor Risk
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Prioritise customers who need collection attention based on due dates and overdue exposure.
        </p>
      </div>


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Due Today
          </p>

          <p className="mt-2 text-2xl font-bold">
            {formatCurrency(
              data.summary.due_today
            )}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Total Overdue
          </p>

          <p className="mt-2 text-2xl font-bold">
            {formatCurrency(
              data.summary.total_overdue
            )}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Critical Customers
          </p>

          <p className="mt-2 text-2xl font-bold">
            {
              data.summary
                .critical_customers
            }
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            More than 90 days overdue
          </p>
        </div>


        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            High Risk
          </p>

          <p className="mt-2 text-2xl font-bold">
            {
              data.summary
                .high_customers
            }
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            61–90 days overdue
          </p>
        </div>
      </div>


      <div className="mt-5 overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-5">
          <h3 className="font-semibold">
            Collection Priority
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Customers Nexus recommends reviewing first.
          </p>
        </div>


        {priorityCustomers.length ===
        0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No customers currently require collection attention.
          </div>
        ) : (
          <div className="divide-y">
            {priorityCustomers.map(
              (
                customer
              ) => (
                <button
                  key={
                    customer.customer_id
                  }
                  type="button"
                  onClick={() =>
                    router.push(
                      `/accounting/debtors/${customer.customer_id}`
                    )
                  }
                  className="grid w-full gap-4 p-5 text-left transition hover:bg-muted/30 md:grid-cols-[1.2fr_0.8fr_0.8fr_1.5fr]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {
                          customer.customer_name
                        }
                      </p>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClass(
                          customer.risk_level
                        )}`}
                      >
                        {riskLabel(
                          customer.risk_level
                        )}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Oldest due:{" "}
                      {formatDate(
                        customer.oldest_due_date
                      )}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Outstanding
                    </p>

                    <p className="mt-1 font-semibold">
                      {formatCurrency(
                        customer.outstanding
                      )}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Overdue
                    </p>

                    <p className="mt-1 font-semibold">
                      {formatCurrency(
                        customer.overdue
                      )}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {
                        customer.max_days_overdue
                      }{" "}
                      days
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Recommended Action
                    </p>

                    <p className="mt-1 text-sm leading-5">
                      {
                        customer.recommended_action
                      }
                    </p>
                  </div>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
