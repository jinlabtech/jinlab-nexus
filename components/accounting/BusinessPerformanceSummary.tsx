"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";


import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Printer,
  RefreshCw,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type MonthlyPerformance = {
  month_name: string;
  month_start: string;

  revenue_actual: number;
  cogs_actual: number;
  operating_expenses_actual: number;
  net_profit_actual: number;

  revenue_budget: number;
  cogs_budget: number;
  operating_expenses_budget: number;
  net_profit_budget: number;
};


type OwnerBusinessDashboard = {
  ok: boolean;

  as_of_date: string;

  company: {
    id: string;
    name: string;
  };

  simple: {
    money_in: number;
    money_out: number;
    profit_kept: number;

    cash_available: number;

    customers_owe_us: number;
    customer_money_overdue: number;
    we_owe: number;

    assets: number;
    liabilities: number;
    net_position: number;

    health: string;
    health_message: string;
  };

  explain: {
    money_in: string;
    money_out: string;
    profit: string;
    assets: string;
    liabilities: string;
    cash: string;
    customers_owe: string;
  };

  budget: {
    available?: boolean;
    budget_id?: string;

    revenue_budget_ytd?: number;
    expense_budget_ytd?: number;
    profit_budget_ytd?: number;

    revenue_variance_ytd?: number;
    expense_variance_ytd?: number;
    profit_variance_ytd?: number;
  };

  monthly:
    MonthlyPerformance[];

  quality: {
    healthy: boolean;
    open_posting_exceptions: number;
    warning:
      string |
      null;
    ledger_source: string;
  };
};


function today() {
  const now =
    new Date();

  const offset =
    now.getTimezoneOffset() *
    60 *
    1000;

  return new Date(
    now.getTime() -
      offset
  )
    .toISOString()
    .slice(
      0,
      10
    );
}


function money(
  value: number
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}


function safePercent(
  value: number,
  total: number
) {
  if (
    total <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      (
        value /
        total
      ) *
        100
    )
  );
}


function AnimatedMoney({
  value,
}: {
  value: number;
}) {
  const [
    display,
    setDisplay,
  ] =
    useState(0);


  useEffect(
    () => {
      const target =
        Number(
          value ?? 0
        );

      const duration =
        900;

      const start =
        performance.now();


      let frame =
        0;


      function tick(
        now: number
      ) {
        const progress =
          Math.min(
            (
              now -
              start
            ) /
              duration,
            1
          );

        const eased =
          1 -
          Math.pow(
            1 -
              progress,
            3
          );


        setDisplay(
          target *
            eased
        );


        if (
          progress <
          1
        ) {
          frame =
            requestAnimationFrame(
              tick
            );
        }
      }


      frame =
        requestAnimationFrame(
          tick
        );


      return () =>
        cancelAnimationFrame(
          frame
        );

    },
    [
      value,
    ]
  );


  return (
    <>
      {
        money(
          display
        )
      }
    </>
  );
}


function MetricCard({
  title,
  value,
  description,
  icon,
  accent,
  delay,
  href,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  accent: string;
  delay: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="nexus-rise group relative block overflow-hidden rounded-2xl border bg-white/90 p-5 text-left shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-lg"
      style={{
        animationDelay:
          `${delay}ms`,
      }}
    >

      <div
        className={`absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl ${accent}`}
      />


      <div className="relative flex items-start justify-between gap-3">

        <div>

          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </p>


          <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <AnimatedMoney
              value={value}
            />
          </p>


          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {description}
          </p>


          <p className="mt-3 text-xs font-semibold">
            Open Accounting →
          </p>

        </div>


        <div className="rounded-xl border bg-neutral-50 p-2.5 transition duration-300 group-hover:scale-110 group-hover:bg-white">
          {icon}
        </div>

      </div>

    </Link>
  );
}


type DonutSegment = {
  label: string;
  value: number;
  description: string;
  className: string;
  dotClass: string;
};


function InteractiveDonut({
  title,
  subtitle,
  segments,
  ready,
}: {
  title: string;
  subtitle: string;

  segments: [
    DonutSegment,
    DonutSegment
  ];

  ready: boolean;
}) {
  const [
    selected,
    setSelected,
  ] =
    useState(0);


  const total =
    Math.max(
      segments[0].value,
      0
    ) +
    Math.max(
      segments[1].value,
      0
    );


  const firstPercent =
    safePercent(
      Math.max(
        segments[0].value,
        0
      ),
      total
    );


  const radius =
    41;

  const circumference =
    2 *
    Math.PI *
    radius;


  const firstLength =
    circumference *
    firstPercent /
    100;


  const secondLength =
    circumference -
    firstLength;


  const selectedSegment =
    segments[
      selected
    ];


  const selectedPercent =
    safePercent(
      Math.max(
        selectedSegment.value,
        0
      ),
      total
    );


  function selectByKeyboard(
    event:
      React.KeyboardEvent,
    index: number
  ) {
    if (
      event.key ===
        "Enter" ||
      event.key ===
        " "
    ) {
      event.preventDefault();

      setSelected(
        index
      );
    }
  }


  return (
    <div className="nexus-rise rounded-3xl border bg-card p-6 shadow-sm transition duration-300 hover:shadow-md">

      <div>

        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          Interactive chart
        </p>


        <h3 className="mt-1 text-xl font-bold">
          {
            title
          }
        </h3>


        <p className="mt-1 text-sm text-muted-foreground">
          {
            subtitle
          }
        </p>

      </div>


      <div className="mt-6 grid items-center gap-7 sm:grid-cols-[190px_1fr]">

        <div className="relative mx-auto h-44 w-44">

          <div className="nexus-chart-glow absolute inset-4 rounded-full bg-neutral-400/10 blur-xl" />


          <svg
            viewBox="0 0 100 100"
            className="relative h-full w-full -rotate-90 drop-shadow-sm"
          >

            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="14"
              className="stroke-neutral-100 dark:stroke-neutral-800"
            />


            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeLinecap="round"
              strokeWidth={
                selected ===
                0
                  ? 17
                  : 13
              }
              className={`${segments[0].className} cursor-pointer transition-all duration-700 outline-none hover:opacity-80`}
              strokeDasharray={
                `${
                  ready
                    ? firstLength
                    : 0
                } ${
                  circumference
                }`
              }
              strokeDashoffset="0"
              role="button"
              tabIndex={0}
              aria-label={
                `${segments[0].label}: ${money(
                  segments[0].value
                )}`
              }
              onClick={() =>
                setSelected(
                  0
                )
              }
              onKeyDown={
                (
                  event
                ) =>
                  selectByKeyboard(
                    event,
                    0
                  )
              }
            />


            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeLinecap="round"
              strokeWidth={
                selected ===
                1
                  ? 17
                  : 13
              }
              className={`${segments[1].className} cursor-pointer transition-all duration-700 outline-none hover:opacity-80`}
              strokeDasharray={
                `${
                  ready
                    ? secondLength
                    : 0
                } ${
                  circumference
                }`
              }
              strokeDashoffset={
                ready
                  ? -firstLength
                  : 0
              }
              role="button"
              tabIndex={0}
              aria-label={
                `${segments[1].label}: ${money(
                  segments[1].value
                )}`
              }
              onClick={() =>
                setSelected(
                  1
                )
              }
              onKeyDown={
                (
                  event
                ) =>
                  selectByKeyboard(
                    event,
                    1
                  )
              }
            />

          </svg>


          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">

            <p className="text-2xl font-bold">
              {
                selectedPercent.toFixed(
                  0
                )
              }%
            </p>

            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {
                selectedSegment.label
              }
            </p>

          </div>

        </div>


        <div className="space-y-3">

          {
            segments.map(
              (
                segment,
                index
              ) => (
                <button
                  key={
                    segment.label
                  }
                  type="button"
                  onClick={() =>
                    setSelected(
                      index
                    )
                  }
                  className={`w-full rounded-2xl border p-4 text-left transition duration-300 ${
                    selected ===
                    index
                      ? "scale-[1.02] border-emerald-300 bg-emerald-50 text-foreground shadow-md dark:border-emerald-700 dark:bg-emerald-950/30"
                      : "bg-background hover:-translate-y-0.5 hover:bg-muted/50"
                  }`}
                >

                  <div className="flex items-center justify-between gap-3">

                    <div className="flex items-center gap-2">

                      <span
                        className={`h-3 w-3 rounded-full ${segment.dotClass}`}
                      />

                      <span className="text-sm font-semibold">
                        {
                          segment.label
                        }
                      </span>

                    </div>


                    <span className="font-bold">
                      {
                        money(
                          segment.value
                        )
                      }
                    </span>

                  </div>

                </button>
              )
            )
          }

        </div>

      </div>


      <div className="mt-5 min-h-28 rounded-2xl border bg-muted/30 p-4 transition-all duration-300">

        <div className="flex items-start gap-3">

          <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${selectedSegment.dotClass}`} />


          <div>

            <p className="font-semibold">
              {
                selectedSegment.label
              }
              {" · "}
              {
                money(
                  selectedSegment.value
                )
              }
            </p>


            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {
                selectedSegment.description
              }
            </p>


            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tap another slice or label to explore the chart.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}


function PlanCard({
  title,
  planned,
  actual,
  delay,
}: {
  title: string;
  planned: number;
  actual: number;
  delay: number;
}) {
  const progress =
    planned > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (
              actual /
              planned
            ) *
              100
          )
        )
      : 0;


  return (
    <div
      className="nexus-rise rounded-2xl border bg-background/90 p-5 shadow-sm"
      style={{
        animationDelay:
          `${delay}ms`,
      }}
    >

      <p className="text-sm text-muted-foreground">
        {
          title
        }
      </p>


      <p className="mt-2 text-2xl font-bold">
        {
          money(
            actual
          )
        }
      </p>


      <p className="mt-1 text-xs text-muted-foreground">
        Plan:{" "}
        {
          money(
            planned
          )
        }
      </p>


      <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">

        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-1000 ease-out"
          style={{
            width:
              `${progress}%`,
          }}
        />

      </div>


      <p className="mt-2 text-xs font-medium">
        {
          progress.toFixed(
            0
          )
        }% of plan
      </p>

    </div>
  );
}


export default function BusinessPerformanceSummary() {

  const [
    data,
    setData,
  ] =
    useState<
      OwnerBusinessDashboard |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);


  const [
    printing,
    setPrinting,
  ] =
    useState(false);


  const [
    ready,
    setReady,
  ] =
    useState(false);


  const [
    selectedMonth,
    setSelectedMonth,
  ] =
    useState<
      MonthlyPerformance |
      null
    >(null);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  async function loadData(
    silent = false
  ) {

    try {

      if (
        silent
      ) {
        setRefreshing(
          true
        );
      } else {
        setLoading(
          true
        );
      }


      setReady(
        false
      );

      setErrorMessage(
        ""
      );


      const {
        data:
          result,
        error,
      } =
        await supabase.rpc(
          "get_owner_business_dashboard",
          {
            p_as_of_date:
              today(),
          }
        );


      if (
        error
      ) {

        if (
          error.message
            .toLowerCase()
            .includes(
              "permission denied"
            )
        ) {
          setData(
            null
          );

          return;
        }

        throw error;
      }


      const next =
        result as OwnerBusinessDashboard;


      setData(
        next
      );


      const activeMonths =
        next.monthly.filter(
          (
            month
          ) =>
            Number(
              month.revenue_actual
            ) !==
              0 ||
            Number(
              month.cogs_actual
            ) !==
              0 ||
            Number(
              month.operating_expenses_actual
            ) !==
              0 ||
            Number(
              month.net_profit_actual
            ) !==
              0
        );


      setSelectedMonth(
        activeMonths[
          activeMonths.length -
            1
        ] ??
        next.monthly[
          next.monthly.length -
            1
        ] ??
        null
      );


      window.setTimeout(
        () =>
          setReady(
            true
          ),
        100
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Business performance could not be loaded."
      );

    } finally {

      setLoading(
        false
      );

      setRefreshing(
        false
      );
    }
  }


  useEffect(
    () => {
      void loadData();
    },
    []
  );


  async function printReport() {

    const printWindow =
      window.open(
        "",
        "_blank"
      );


    if (
      !printWindow
    ) {
      setErrorMessage(
        "The report window was blocked by the browser."
      );

      return;
    }


    printWindow.document.open();

    printWindow.document.write(
      `
      <!doctype html>
      <html>
        <body style="
          margin:0;
          font-family:Arial,Helvetica,sans-serif;
          background:#fff;
          color:#111;
          padding:48px;
          text-align:center;
        ">
          <div style="
            max-width:680px;
            margin:80px auto;
          ">
            <h2>Preparing your business report...</h2>
            <p>This will open as a clean printable report.</p>
          </div>
        </body>
      </html>
      `
    );

    printWindow.document.close();


    try {

      setPrinting(
        true
      );

      setErrorMessage(
        ""
      );


      const {
        data:
          html,
        error,
      } =
        await supabase.rpc(
          "get_business_performance_print_html",
          {
            p_as_of_date:
              today(),
          }
        );


      if (
        error
      ) {
        throw error;
      }


      printWindow.document.open();

      printWindow.document.write(
        String(
          html ??
          ""
        )
      );

      printWindow.document.close();

    } catch (
      error
    ) {

      printWindow.close();

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The report could not be prepared."
      );

    } finally {

      setPrinting(
        false
      );
    }
  }


  const recentMonths =
    useMemo(
      () => {

        if (
          !data
        ) {
          return [];
        }


        const active =
          data.monthly.filter(
            (
              month
            ) =>
              Number(
                month.revenue_actual
              ) !==
                0 ||
              Number(
                month.cogs_actual
              ) !==
                0 ||
              Number(
                month.operating_expenses_actual
              ) !==
                0 ||
              Number(
                month.net_profit_actual
              ) !==
                0
          );


        return (
          active.length
            ? active
            : data.monthly
        ).slice(
          -6
        );

      },
      [
        data,
      ]
    );


  const chartMax =
    useMemo(
      () => {

        let max =
          1;


        for (
          const month of
          recentMonths
        ) {

          const outgoing =
            Number(
              month.cogs_actual
            ) +
            Number(
              month.operating_expenses_actual
            );


          max =
            Math.max(
              max,

              Math.abs(
                Number(
                  month.revenue_actual
                )
              ),

              Math.abs(
                outgoing
              ),

              Math.abs(
                Number(
                  month.net_profit_actual
                )
              )
            );
        }


        return max;

      },
      [
        recentMonths,
      ]
    );


  if (
    loading
  ) {

    return (
      <section className="mb-8 overflow-hidden rounded-3xl border bg-card p-6 shadow-sm">

        <div className="animate-pulse space-y-5">

          <div className="h-8 w-72 rounded bg-muted" />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            {
              Array.from(
                {
                  length:
                    4,
                }
              ).map(
                (
                  _,
                  index
                ) => (
                  <div
                    key={
                      index
                    }
                    className="h-28 rounded-2xl bg-muted"
                  />
                )
              )
            }

          </div>

        </div>

      </section>
    );
  }


  if (
    !data &&
    !errorMessage
  ) {
    return null;
  }


  if (
    !data
  ) {

    return (
      <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {
          errorMessage
        }
      </div>
    );
  }


  const s =
    data.simple;


  const budget =
    data.budget;


  const selectedOutgoing =
    selectedMonth
      ? Number(
          selectedMonth.cogs_actual
        ) +
        Number(
          selectedMonth.operating_expenses_actual
        )
      : 0;


  return (
    <section className="mb-10">

      <style>
        {`
          @keyframes nexusRise {
            from {
              opacity: 0;
              transform: translateY(18px) scale(.985);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes nexusFloat {
            0%, 100% {
              transform: translate3d(0,0,0) scale(1);
            }
            50% {
              transform: translate3d(12px,-16px,0) scale(1.06);
            }
          }

          @keyframes nexusFloatReverse {
            0%, 100% {
              transform: translate3d(0,0,0) scale(1);
            }
            50% {
              transform: translate3d(-14px,12px,0) scale(.96);
            }
          }

          @keyframes nexusPulse {
            0%, 100% {
              transform: scale(1);
              opacity: .75;
            }
            50% {
              transform: scale(1.45);
              opacity: 1;
            }
          }

          @keyframes nexusGlow {
            0%, 100% {
              opacity: .25;
              transform: scale(.94);
            }
            50% {
              opacity: .55;
              transform: scale(1.08);
            }
          }

          .nexus-rise {
            opacity: 0;
            animation:
              nexusRise .7s
              cubic-bezier(.2,.8,.2,1)
              forwards;
          }

          .nexus-float {
            animation:
              nexusFloat 7s
              ease-in-out
              infinite;
          }

          .nexus-float-reverse {
            animation:
              nexusFloatReverse 9s
              ease-in-out
              infinite;
          }

          .nexus-pulse {
            animation:
              nexusPulse 1.8s
              ease-in-out
              infinite;
          }

          .nexus-chart-glow {
            animation:
              nexusGlow 3.6s
              ease-in-out
              infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .nexus-rise,
            .nexus-float,
            .nexus-float-reverse,
            .nexus-pulse,
            .nexus-chart-glow {
              animation: none !important;
              opacity: 1 !important;
            }
          }
        `}
      </style>


      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">

        <div>

          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Live Business Picture
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            Tap a chart to understand your business
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            The charts explain the numbers first. Detailed accounting stays underneath.
          </p>

        </div>


        <Link
          href="/accounting"
          className="rounded-lg border bg-background px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-muted"
        >
          Open Accounting →
        </Link>

      </div>


      <div className="mt-5 grid gap-5 xl:grid-cols-2">

        <InteractiveDonut
          title="Money In vs Money Out"
          subtitle="Click any slice to see exactly what it means."
          ready={
            ready
          }
          segments={[
            {
              label:
                "Money In",

              value:
                s.money_in,

              description:
                "Money earned from sales and services. This is business activity coming in before costs are removed.",

              className:
                "stroke-emerald-500",

              dotClass:
                "bg-emerald-500",
            },

            {
              label:
                "Money Out",

              value:
                s.money_out,

              description:
                "Money used for stock costs and running expenses. Lower spending is not always better — spending should support profitable growth.",

              className:
                "stroke-rose-500",

              dotClass:
                "bg-rose-500",
            },
          ]}
        />


        <InteractiveDonut
          title="What We Own vs What We Owe"
          subtitle="Click a slice for a plain-English explanation."
          ready={
            ready
          }
          segments={[
            {
              label:
                "Assets",

              value:
                s.assets,

              description:
                "Assets are value the business owns or controls — for example cash, bank balances, stock and customer money still to be collected.",

              className:
                "stroke-violet-500",

              dotClass:
                "bg-violet-500",
            },

            {
              label:
                "Liabilities",

              value:
                s.liabilities,

              description:
                "Liabilities are amounts the business owes to other people or organisations. They are future obligations the business still needs to settle.",

              className:
                "stroke-amber-500",

              dotClass:
                "bg-amber-500",
            },
          ]}
        />

      </div>




      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white via-neutral-50 to-emerald-50/40 p-6 text-foreground shadow-sm sm:p-8">

        <div className="nexus-float absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-300/25 blur-3xl" />

        <div className="nexus-float-reverse absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />

        <div className="nexus-float absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-violet-300/20 blur-3xl" />


        <div className="relative flex flex-wrap items-start justify-between gap-5">

          <div>

            <div className="flex items-center gap-2">

              <span className="nexus-pulse h-2.5 w-2.5 rounded-full bg-emerald-400" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                JINLAB Nexus · Live Business View
              </p>

            </div>


            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
              How is the business doing?
            </h2>


            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Simple business reporting on top.
              Full accounting runs quietly underneath.
            </p>

          </div>


          <div className="flex flex-wrap gap-2">

            <Button
              type="button"
              variant="outline"
              disabled={
                refreshing
              }
              onClick={() =>
                void loadData(
                  true
                )
              }
              className="bg-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-50"
            >

              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  refreshing
                    ? "animate-spin"
                    : ""
                }`}
              />

              {
                refreshing
                  ? "Refreshing..."
                  : "Refresh"
              }

            </Button>


            <Button
              type="button"
              disabled={
                printing
              }
              onClick={() =>
                void printReport()
              }
              className="bg-emerald-600 text-white transition duration-300 hover:-translate-y-0.5 hover:bg-emerald-700"
            >

              <Printer className="mr-2 h-4 w-4" />

              {
                printing
                  ? "Preparing..."
                  : "Print Simple Report"
              }

            </Button>

          </div>

        </div>


        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

          <MetricCard
            title="Money In"
            value={
              s.money_in
            }
            description="Sales and services earned."
            icon={
              <ArrowUpRight className="h-5 w-5 text-emerald-300" />
            }
            accent="bg-emerald-400"
            delay={80}
            href="/accounting/performance"
          />


          <MetricCard
            title="Money Out"
            value={
              s.money_out
            }
            description="Costs and running expenses."
            icon={
              <ArrowDownRight className="h-5 w-5 text-rose-300" />
            }
            accent="bg-rose-400"
            delay={160}
            href="/accounting/performance"
          />


          <MetricCard
            title="Profit Kept"
            value={
              s.profit_kept
            }
            description="What remains after costs."
            icon={
              <TrendingUp className="h-5 w-5 text-violet-300" />
            }
            accent="bg-violet-400"
            delay={240}
            href="/accounting/performance"
          />


          <MetricCard
            title="Cash Available"
            value={
              s.cash_available
            }
            description="Cash and bank money."
            icon={
              <WalletCards className="h-5 w-5 text-amber-300" />
            }
            accent="bg-amber-400"
            delay={320}
            href="/accounting"
          />

        </div>


        <div
          className="nexus-rise relative mt-4 rounded-2xl border bg-white/80 p-4 shadow-sm backdrop-blur"
          style={{
            animationDelay:
              "400ms",
          }}
        >

          <div className="flex flex-wrap items-center justify-between gap-4">

            <div>

              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Business Health
              </p>

              <div className="mt-1 flex items-center gap-2">

                <Sparkles className="h-5 w-5 text-amber-300" />

                <p className="text-xl font-bold">
                  {
                    s.health
                  }
                </p>

              </div>

            </div>


            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {
                s.health_message
              }
            </p>

          </div>

        </div>

      </div>


      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div
          className="nexus-rise group cursor-pointer rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 transition duration-300 hover:-translate-y-1 hover:shadow-md"
          role="link"
          tabIndex={0}
          onClick={() => window.location.assign("/accounting/debtors")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              window.location.assign("/accounting/debtors");
            }
          }}
          style={{
            animationDelay:
              "120ms",
          }}
        >

          <HandCoins className="h-5 w-5 transition duration-300 group-hover:scale-110" />

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
            Customers Owe Us
          </p>

          <p className="mt-2 text-2xl font-bold">
            <AnimatedMoney
              value={
                s.customers_owe_us
              }
            />
          </p>

          <p className="mt-2 text-xs leading-5">
            Money earned but not collected yet.
          </p>

        </div>


        <div
          className="nexus-rise group cursor-pointer rounded-2xl border border-orange-200 bg-orange-50 p-5 text-orange-950 transition duration-300 hover:-translate-y-1 hover:shadow-md"
          role="link"
          tabIndex={0}
          onClick={() => window.location.assign("/accounting/debtors")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              window.location.assign("/accounting/debtors");
            }
          }}
          style={{
            animationDelay:
              "200ms",
          }}
        >

          <CircleDollarSign className="h-5 w-5 transition duration-300 group-hover:scale-110" />

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
            Customer Money Overdue
          </p>

          <p className="mt-2 text-2xl font-bold">
            <AnimatedMoney
              value={
                s.customer_money_overdue
              }
            />
          </p>

          <p className="mt-2 text-xs leading-5">
            Customer payments that are already late.
          </p>

        </div>


        <div
          className="nexus-rise group cursor-pointer rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950 transition duration-300 hover:-translate-y-1 hover:shadow-md"
          role="link"
          tabIndex={0}
          onClick={() => window.location.assign("/accounting")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              window.location.assign("/accounting");
            }
          }}
          style={{
            animationDelay:
              "280ms",
          }}
        >

          <Banknote className="h-5 w-5 transition duration-300 group-hover:scale-110" />

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
            We Owe
          </p>

          <p className="mt-2 text-2xl font-bold">
            <AnimatedMoney
              value={
                s.we_owe
              }
            />
          </p>

          <p className="mt-2 text-xs leading-5">
            Money the business owes to others.
          </p>

        </div>


        <div
          className="nexus-rise group cursor-pointer rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 transition duration-300 hover:-translate-y-1 hover:shadow-md"
          role="link"
          tabIndex={0}
          onClick={() => window.location.assign("/accounting")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              window.location.assign("/accounting");
            }
          }}
          style={{
            animationDelay:
              "360ms",
          }}
        >

          <Landmark className="h-5 w-5 transition duration-300 group-hover:scale-110" />

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
            Net Position
          </p>

          <p className="mt-2 text-2xl font-bold">
            <AnimatedMoney
              value={
                s.net_position
              }
            />
          </p>

          <p className="mt-2 text-xs leading-5">
            Assets minus liabilities.
          </p>

        </div>

      </div>


      <div className="nexus-rise mt-5 rounded-3xl border bg-card p-6 shadow-sm">

        <div className="flex flex-wrap items-end justify-between gap-4">

          <div>

            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              Interactive Trend
            </p>

            <h3 className="mt-1 text-xl font-bold">
              Month by Month
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Click any month to inspect what happened.
            </p>

          </div>


          <div className="flex flex-wrap gap-4 text-xs font-medium">

            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Money In
            </span>

            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              Money Out
            </span>

            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
              Profit
            </span>

          </div>

        </div>


        <div className="mt-7 space-y-3">

          {
            recentMonths.map(
              (
                month,
                index
              ) => {

                const outgoing =
                  Number(
                    month.cogs_actual
                  ) +
                  Number(
                    month.operating_expenses_actual
                  );


                const revenueWidth =
                  Math.min(
                    100,
                    Math.abs(
                      Number(
                        month.revenue_actual
                      )
                    ) /
                      chartMax *
                      100
                  );


                const expenseWidth =
                  Math.min(
                    100,
                    Math.abs(
                      outgoing
                    ) /
                      chartMax *
                      100
                  );


                const profitWidth =
                  Math.min(
                    100,
                    Math.abs(
                      Number(
                        month.net_profit_actual
                      )
                    ) /
                      chartMax *
                      100
                  );


                const active =
                  selectedMonth
                    ?.month_start ===
                  month.month_start;


                return (
                  <button
                    key={
                      month.month_start
                    }
                    type="button"
                    onClick={() =>
                      setSelectedMonth(
                        month
                      )
                    }
                    className={`nexus-rise grid w-full gap-3 rounded-2xl border p-4 text-left transition duration-300 sm:grid-cols-[100px_1fr_140px] sm:items-center ${
                      active
                        ? "scale-[1.01] border-violet-300 bg-violet-50 text-foreground shadow-md dark:border-violet-700 dark:bg-violet-950/30"
                        : "bg-background hover:-translate-y-0.5 hover:bg-muted/40"
                    }`}
                    style={{
                      animationDelay:
                        `${index * 80}ms`,
                    }}
                  >

                    <p className="text-sm font-semibold">
                      {
                        month.month_name
                      }
                    </p>


                    <div className="space-y-2">

                      <div className="h-3 overflow-hidden rounded-full bg-emerald-100/80 dark:bg-emerald-950/40">

                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-1000 ease-out"
                          style={{
                            width:
                              `${
                                ready
                                  ? revenueWidth
                                  : 0
                              }%`,
                          }}
                        />

                      </div>


                      <div className="h-3 overflow-hidden rounded-full bg-rose-100/80 dark:bg-rose-950/40">

                        <div
                          className="h-full rounded-full bg-rose-500 transition-all duration-1000 ease-out"
                          style={{
                            width:
                              `${
                                ready
                                  ? expenseWidth
                                  : 0
                              }%`,
                          }}
                        />

                      </div>


                      <div className="h-3 overflow-hidden rounded-full bg-violet-100/80 dark:bg-violet-950/40">

                        <div
                          className="h-full rounded-full bg-violet-500 transition-all duration-1000 ease-out"
                          style={{
                            width:
                              `${
                                ready
                                  ? profitWidth
                                  : 0
                              }%`,
                          }}
                        />

                      </div>

                    </div>


                    <div className="text-sm sm:text-right">

                      <p className="font-bold">
                        {
                          money(
                            month.net_profit_actual
                          )
                        }
                      </p>

                      <p className={`text-xs ${
                        active
                          ? "text-violet-700 dark:text-violet-300"
                          : "text-muted-foreground"
                      }`}>
                        profit kept
                      </p>

                    </div>

                  </button>
                );
              }
            )
          }

        </div>


        {
          selectedMonth && (
            <div className="mt-5 rounded-2xl border bg-muted/30 p-5">

              <div className="flex flex-wrap items-start justify-between gap-4">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Selected Month
                  </p>

                  <h4 className="mt-1 text-xl font-bold">
                    {
                      selectedMonth.month_name
                    }
                  </h4>

                </div>


                <p className="text-sm text-muted-foreground">
                  Click another month to compare.
                </p>

              </div>


              <div className="mt-5 grid gap-4 sm:grid-cols-3">

                <div className="rounded-xl border bg-background p-4">

                  <p className="text-xs text-muted-foreground">
                    Money In
                  </p>

                  <p className="mt-1 text-xl font-bold text-emerald-700">
                    {
                      money(
                        selectedMonth.revenue_actual
                      )
                    }
                  </p>

                </div>


                <div className="rounded-xl border bg-background p-4">

                  <p className="text-xs text-muted-foreground">
                    Money Out
                  </p>

                  <p className="mt-1 text-xl font-bold text-rose-700">
                    {
                      money(
                        selectedOutgoing
                      )
                    }
                  </p>

                </div>


                <div className="rounded-xl border bg-background p-4">

                  <p className="text-xs text-muted-foreground">
                    Profit Kept
                  </p>

                  <p className="mt-1 text-xl font-bold text-violet-700">
                    {
                      money(
                        selectedMonth.net_profit_actual
                      )
                    }
                  </p>

                </div>

              </div>

            </div>
          )
        }

      </div>


      {
        budget.available && (
          <div className="nexus-rise mt-5 rounded-3xl border bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-6 shadow-sm dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">

            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-amber-700 dark:text-amber-300">
              Plan vs Reality
            </p>

            <h3 className="mt-1 text-xl font-bold">
              Are we following the budget?
            </h3>


            <p className="mt-1 text-sm text-muted-foreground">
              Planned figures compared with what actually happened.
            </p>


            <div className="mt-5 grid gap-4 md:grid-cols-3">

              <PlanCard
                title="Money In"
                planned={
                  Number(
                    budget.revenue_budget_ytd ??
                    0
                  )
                }
                actual={
                  s.money_in
                }
                delay={80}
              />


              <PlanCard
                title="Money Out"
                planned={
                  Number(
                    budget.expense_budget_ytd ??
                    0
                  )
                }
                actual={
                  s.money_out
                }
                delay={160}
              />


              <PlanCard
                title="Profit"
                planned={
                  Number(
                    budget.profit_budget_ytd ??
                    0
                  )
                }
                actual={
                  s.profit_kept
                }
                delay={240}
              />

            </div>

          </div>
        )
      }


      {
        data.quality.warning && (
          <div className="nexus-rise mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">

            <strong>
              Profit note:
            </strong>{" "}

            Some stock costs are not yet fully included,
            so today&apos;s profit can temporarily look higher
            than the final true profit. Nexus will correct this
            once inventory costing is fully connected.

          </div>
        )
      }


      {
        errorMessage && (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {
              errorMessage
            }
          </div>
        )
      }

    </section>
  );
}
