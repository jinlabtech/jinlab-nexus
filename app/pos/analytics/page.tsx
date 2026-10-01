"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Activity,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type RiskSignal = {
  type: string;
  title: string;
  description: string;
  risk_score: number;
  branch?: string | null;
  cashier?: string | null;
  reference?: string | null;
  amount?: number | null;
  event_at: string;
};


type Workspace = {
  ok: boolean;

  days: number;

  branches: {
    id: string;
    name: string;
  }[];

  summary: {
    gross_sales: number;
    refund_total: number;
    net_sales: number;
    sale_count: number;
    return_count: number;
    receipt_reprints: number;
    discounted_lines: number;
    cash_shortage_total: number;
    cash_overage_total: number;
    expired_approvals: number;
    rejected_approvals: number;
  };

  risk_signals:
    RiskSignal[];

  cashiers: {
    cashier_user_id:
      string |
      null;

    cashier_name:
      string;

    sale_count:
      number;

    gross_sales:
      number;
  }[];
};


function money(
  value:
    number |
    string |
    null |
    undefined
) {

  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}


function dateTime(
  value: string
) {

  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(
    new Date(
      value
    )
  );
}


export default function PosAnalyticsPage() {

  const router =
    useRouter();


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB"
    );


  const [
    userName,
    setUserName,
  ] =
    useState(
      "JINLAB User"
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<Workspace | null>(
      null
    );


  const [
    branchId,
    setBranchId,
  ] =
    useState(
      ""
    );


  const [
    days,
    setDays,
  ] =
    useState(
      30
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState(
      ""
    );


  async function loadWorkspace(
    nextBranch =
      branchId,

    nextDays =
      days
  ) {

    setLoading(
      true
    );

    setErrorMessage(
      ""
    );


    try {

      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();


      if (!user) {

        router.replace(
          "/login"
        );

        return;
      }


      const {
        data:
          profile,
      } =
        await supabase
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
          .maybeSingle();


      if (
        profile?.full_name
      ) {

        setUserName(
          profile.full_name
        );
      }


      if (
        profile?.company_id
      ) {

        const {
          data:
            company,
        } =
          await supabase
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
            .maybeSingle();


        if (
          company?.company_name
        ) {

          setCompanyName(
            company.company_name
          );
        }

      }


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_pos_analytics_workspace",
          {
            p_branch_id:
              nextBranch ||
              null,

            p_days:
              nextDays,
          }
        );


      if (error) {
        throw error;
      }


      setWorkspace(
        data as Workspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load POS analytics."
      );

    } finally {

      setLoading(
        false
      );

    }

  }


  useEffect(
    () => {

      void loadWorkspace(
        "",
        30
      );

    },
    []
  );


  async function logout() {

    await supabase.auth.signOut();

    router.replace(
      "/login"
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
        onLogout={
          logout
        }
      />


      <main className="p-4 sm:p-6 lg:p-8">

        <div className="mx-auto max-w-7xl">


          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">

            <div>

              <div className="flex items-center gap-2">

                <ShieldAlert className="h-6 w-6" />

                <h1 className="text-2xl font-bold">
                  POS Analytics & Risk Signals
                </h1>

              </div>


              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Owner intelligence for sales,
                refunds, cash differences,
                approvals and unusual POS activity.
                Risk signals require human review.
              </p>

            </div>


            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void loadWorkspace()
              }
              disabled={
                loading
              }
            >
              <RefreshCw className="mr-2 h-4 w-4" />

              Refresh
            </Button>

          </div>


          <div className="mb-6 flex flex-wrap gap-3 rounded-2xl border bg-background p-4">

            <SearchableSelect searchLabel="Branches"
              value={
                branchId
              }
              onValueChange={
                (
                  selectedValue
                ) => {

                  const value =
                    selectedValue;

                  setBranchId(
                    value
                  );

                  void loadWorkspace(
                    value,
                    days
                  );
                }
              }
              className="h-11 rounded-xl border bg-background px-3 text-sm"
            >
              <option value="">
                All branches
              </option>

              {
                workspace
                  ?.branches
                  .map(
                    (
                      branch
                    ) => (

                      <option
                        key={
                          branch.id
                        }
                        value={
                          branch.id
                        }
                      >
                        {
                          branch.name
                        }
                      </option>

                    )
                  )
              }

            </SearchableSelect>


            <select
              value={
                days
              }
              onChange={
                (
                  event
                ) => {

                  const value =
                    Number(
                      event.target.value
                    );

                  setDays(
                    value
                  );

                  void loadWorkspace(
                    branchId,
                    value
                  );
                }
              }
              className="h-11 rounded-xl border bg-background px-3 text-sm"
            >
              <option value={7}>
                Last 7 days
              </option>

              <option value={30}>
                Last 30 days
              </option>

              <option value={90}>
                Last 90 days
              </option>

              <option value={365}>
                Last year
              </option>
            </select>

          </div>


          {
            errorMessage && (
              <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {
                  errorMessage
                }
              </div>
            )
          }


          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            {
              [
                [
                  "Net sales",
                  money(
                    workspace
                      ?.summary
                      .net_sales
                  ),
                ],

                [
                  "Refunds",
                  money(
                    workspace
                      ?.summary
                      .refund_total
                  ),
                ],

                [
                  "Cash shortages",
                  money(
                    workspace
                      ?.summary
                      .cash_shortage_total
                  ),
                ],

                [
                  "Risk signals",
                  String(
                    workspace
                      ?.risk_signals
                      .length ??
                    0
                  ),
                ],
              ].map(
                (
                  card
                ) => (

                  <div
                    key={
                      card[0]
                    }
                    className="rounded-2xl border bg-background p-5"
                  >

                    <p className="text-xs uppercase text-muted-foreground">
                      {
                        card[0]
                      }
                    </p>


                    <p className="mt-2 text-2xl font-bold">
                      {
                        card[1]
                      }
                    </p>

                  </div>

                )
              )
            }

          </div>


          <section className="mb-8">

            <div className="mb-4 flex items-center gap-2">

              <Activity className="h-5 w-5" />

              <h2 className="text-lg font-bold">
                Risk Review Queue
              </h2>

            </div>


            {
              loading ? (

                <div className="rounded-2xl border bg-background p-8 text-center text-sm text-muted-foreground">
                  Analysing POS activity...
                </div>

              ) : workspace
                  ?.risk_signals
                  .length ===
                0 ? (

                <div className="rounded-2xl border border-dashed bg-background p-8 text-center">

                  <p className="font-semibold">
                    No risk signals detected
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Nothing in this period currently
                    meets the monitoring rules.
                  </p>

                </div>

              ) : (

                <div className="space-y-3">

                  {
                    workspace
                      ?.risk_signals
                      .map(
                        (
                          signal,
                          index
                        ) => (

                          <div
                            key={
                              `${signal.type}-${signal.reference}-${index}`
                            }
                            className="rounded-2xl border bg-background p-5"
                          >

                            <div className="flex flex-wrap items-start justify-between gap-4">

                              <div>

                                <p className="font-bold">
                                  {
                                    signal.title
                                  }
                                </p>


                                <p className="mt-1 text-sm text-muted-foreground">
                                  {
                                    signal.description
                                  }
                                </p>


                                <p className="mt-2 text-xs text-muted-foreground">

                                  {
                                    signal.branch ??
                                    "Branch"
                                  }

                                  {" · "}

                                  {
                                    signal.cashier ??
                                    "User"
                                  }

                                  {" · "}

                                  {
                                    dateTime(
                                      signal.event_at
                                    )
                                  }

                                </p>

                              </div>


                              <div className="rounded-xl border px-4 py-2 text-center">

                                <p className="text-xs text-muted-foreground">
                                  Risk
                                </p>

                                <p className="text-xl font-black">
                                  {
                                    signal.risk_score
                                  }
                                </p>

                              </div>

                            </div>

                          </div>

                        )
                      )
                  }

                </div>

              )
            }

          </section>


          <section>

            <h2 className="mb-4 text-lg font-bold">
              Cashier Sales Performance
            </h2>


            <div className="overflow-x-auto rounded-2xl border bg-background">

              <table className="w-full min-w-[600px] text-sm">

                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">

                  <tr>
                    <th className="px-4 py-3">
                      Cashier
                    </th>

                    <th className="px-4 py-3 text-right">
                      Transactions
                    </th>

                    <th className="px-4 py-3 text-right">
                      Gross sales
                    </th>
                  </tr>

                </thead>


                <tbody className="divide-y">

                  {
                    workspace
                      ?.cashiers
                      .map(
                        (
                          cashier
                        ) => (

                          <tr
                            key={
                              cashier
                                .cashier_user_id ??
                              cashier
                                .cashier_name
                            }
                          >

                            <td className="px-4 py-4 font-semibold">
                              {
                                cashier.cashier_name
                              }
                            </td>

                            <td className="px-4 py-4 text-right">
                              {
                                cashier.sale_count
                              }
                            </td>

                            <td className="px-4 py-4 text-right font-bold">
                              {
                                money(
                                  cashier.gross_sales
                                )
                              }
                            </td>

                          </tr>

                        )
                      )
                  }

                </tbody>

              </table>

            </div>

          </section>

        </div>

      </main>

    </DashboardLayout>
  );
}
