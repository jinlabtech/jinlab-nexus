"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Banknote,
  RefreshCw,
  Scale,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type Totals = {
  opening_float: number;
  cash_sales: number;
  card_sales: number;
  eft_sales: number;
  other_sales: number;
  cash_refunds: number;
  card_refunds: number;
  eft_refunds: number;
  other_refunds: number;
  gross_sales: number;
  total_refunds: number;
  net_sales: number;
  transaction_count: number;
  return_count: number;
  expected_cash: number;
};


type OpenSession = {
  id: string;
  session_number: string;
  branch_id: string;
  branch_name: string;
  cashier_name: string;
  opened_at: string;
  opening_float: number;
  totals: Totals;
};


type ClosedSession = {
  id: string;
  session_number: string;
  branch_name: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string;
  expected_cash: number | null;
  counted_cash: number | null;
  cash_difference: number | null;
  closing_notes?: string | null;
  reconciliation: Totals;
};


type CashupWorkspace = {
  ok: boolean;
  can_manage: boolean;
  can_close: boolean;

  branches: {
    id: string;
    name: string;
  }[];

  open_sessions: OpenSession[];
  recent_sessions: ClosedSession[];
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
  value:
    string |
    null |
    undefined
) {

  if (!value) {
    return "—";
  }


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


export default function PosCashupPage() {

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
    useState<CashupWorkspace | null>(
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
    selectedBranchId =
      branchId
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
          "get_pos_cashup_workspace",
          {
            p_branch_id:
              selectedBranchId ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setWorkspace(
        data as CashupWorkspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load POS cash-up."
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
        ""
      );

    },
    []
  );


  const summary =
    useMemo(
      () => {

        const sessions =
          workspace?.open_sessions ??
          [];


        return sessions.reduce(
          (
            total,
            session
          ) => ({
            netSales:
              total.netSales +
              Number(
                session.totals.net_sales ||
                0
              ),

            expectedCash:
              total.expectedCash +
              Number(
                session.totals.expected_cash ||
                0
              ),

            refunds:
              total.refunds +
              Number(
                session.totals.total_refunds ||
                0
              ),
          }),
          {
            netSales: 0,
            expectedCash: 0,
            refunds: 0,
          }
        );

      },
      [
        workspace,
      ]
    );


  async function closeTill(
    session:
      OpenSession
  ) {

    const counted =
      window.prompt(
        `Count the physical cash for ${session.session_number}.\n\nExpected: ${money(
          session.totals.expected_cash
        )}`,
        String(
          session.totals.expected_cash
        )
      );


    if (
      counted ===
      null
    ) {
      return;
    }


    const countedCash =
      Number(
        counted
      );


    if (
      !Number.isFinite(
        countedCash
      ) ||
      countedCash <
        0
    ) {

      setErrorMessage(
        "Enter a valid counted cash amount."
      );

      return;
    }


    const notes =
      window.prompt(
        "Closing notes / explanation for any difference:",
        ""
      );


    try {

      const {
        error,
      } =
        await supabase.rpc(
          "close_pos_till_session",
          {
            p_session_id:
              session.id,

            p_counted_cash:
              countedCash,

            p_notes:
              notes?.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      await loadWorkspace();

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to close till."
      );

    }

  }


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

                <Scale className="h-6 w-6" />

                <h1 className="text-2xl font-bold">
                  Cash-up & Reconciliation
                </h1>

              </div>


              <p className="mt-2 text-sm text-muted-foreground">
                Reconcile till sessions, payments,
                refunds, expected cash and physical
                cash differences.
              </p>

            </div>


            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void loadWorkspace()
              }
            >
              <RefreshCw className="mr-2 h-4 w-4" />

              Refresh
            </Button>

          </div>


          <div className="mb-6 rounded-2xl border bg-background p-4">

            <label className="text-sm font-semibold">
              Branch
            </label>


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
                    value
                  );
                }
              }
              className="mt-2 h-11 w-full max-w-sm rounded-xl border bg-background px-3 text-sm"
            >
              <option value="">
                All branches
              </option>


              {
                workspace?.branches.map(
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


          <div className="mb-6 grid gap-4 md:grid-cols-4">

            <div className="rounded-2xl border bg-background p-5">

              <p className="text-xs uppercase text-muted-foreground">
                Open tills
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  workspace
                    ?.open_sessions
                    .length ??
                  0
                }
              </p>

            </div>


            <div className="rounded-2xl border bg-background p-5">

              <p className="text-xs uppercase text-muted-foreground">
                Net sales
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  money(
                    summary.netSales
                  )
                }
              </p>

            </div>


            <div className="rounded-2xl border bg-background p-5">

              <p className="text-xs uppercase text-muted-foreground">
                Refunds
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  money(
                    summary.refunds
                  )
                }
              </p>

            </div>


            <div className="rounded-2xl border bg-background p-5">

              <p className="text-xs uppercase text-muted-foreground">
                Expected cash
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  money(
                    summary.expectedCash
                  )
                }
              </p>

            </div>

          </div>


          <section className="mb-8">

            <h2 className="mb-4 text-lg font-bold">
              Open Till Sessions
            </h2>


            {
              loading ? (

                <div className="rounded-2xl border bg-background p-8 text-center text-sm text-muted-foreground">
                  Loading cash-up...
                </div>

              ) : workspace?.open_sessions.length ===
                0 ? (

                <div className="rounded-2xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
                  No open till sessions.
                </div>

              ) : (

                <div className="grid gap-4 xl:grid-cols-2">

                  {
                    workspace?.open_sessions.map(
                      (
                        session
                      ) => (

                        <div
                          key={
                            session.id
                          }
                          className="rounded-2xl border bg-background p-5"
                        >

                          <div className="flex flex-wrap items-start justify-between gap-4">

                            <div>

                              <p className="font-bold">
                                {
                                  session.session_number
                                }
                              </p>

                              <p className="mt-1 text-sm text-muted-foreground">
                                {
                                  session.branch_name
                                } · {
                                  session.cashier_name
                                }
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                Opened {
                                  dateTime(
                                    session.opened_at
                                  )
                                }
                              </p>

                            </div>


                            {
                              workspace?.can_close && (
                                <Button
                                  type="button"
                                  onClick={() =>
                                    void closeTill(
                                      session
                                    )
                                  }
                                >
                                  <Banknote className="mr-2 h-4 w-4" />

                                  Close Till
                                </Button>
                              )
                            }

                          </div>


                          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">

                            <div>
                              <span className="text-muted-foreground">
                                Opening float
                              </span>

                              <p className="font-semibold">
                                {
                                  money(
                                    session.totals.opening_float
                                  )
                                }
                              </p>
                            </div>


                            <div>
                              <span className="text-muted-foreground">
                                Gross sales
                              </span>

                              <p className="font-semibold">
                                {
                                  money(
                                    session.totals.gross_sales
                                  )
                                }
                              </p>
                            </div>


                            <div>
                              <span className="text-muted-foreground">
                                Refunds
                              </span>

                              <p className="font-semibold">
                                {
                                  money(
                                    session.totals.total_refunds
                                  )
                                }
                              </p>
                            </div>


                            <div>
                              <span className="text-muted-foreground">
                                Net sales
                              </span>

                              <p className="font-semibold">
                                {
                                  money(
                                    session.totals.net_sales
                                  )
                                }
                              </p>
                            </div>


                            <div>
                              <span className="text-muted-foreground">
                                Cash sales
                              </span>

                              <p className="font-semibold">
                                {
                                  money(
                                    session.totals.cash_sales
                                  )
                                }
                              </p>
                            </div>


                            <div>
                              <span className="text-muted-foreground">
                                Cash refunds
                              </span>

                              <p className="font-semibold">
                                {
                                  money(
                                    session.totals.cash_refunds
                                  )
                                }
                              </p>
                            </div>


                            <div className="col-span-2 border-t pt-3">

                              <span className="text-muted-foreground">
                                Expected physical cash
                              </span>

                              <p className="text-xl font-black">
                                {
                                  money(
                                    session.totals.expected_cash
                                  )
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
              Recent Cash-ups
            </h2>


            <div className="overflow-x-auto rounded-2xl border bg-background">

              <table className="w-full min-w-[900px] text-sm">

                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">

                  <tr>
                    <th className="px-4 py-3">
                      Session
                    </th>

                    <th className="px-4 py-3">
                      Cashier
                    </th>

                    <th className="px-4 py-3">
                      Branch
                    </th>

                    <th className="px-4 py-3">
                      Closed
                    </th>

                    <th className="px-4 py-3 text-right">
                      Expected
                    </th>

                    <th className="px-4 py-3 text-right">
                      Counted
                    </th>

                    <th className="px-4 py-3 text-right">
                      Difference
                    </th>
                  </tr>

                </thead>


                <tbody className="divide-y">

                  {
                    workspace?.recent_sessions.map(
                      (
                        session
                      ) => (

                        <tr
                          key={
                            session.id
                          }
                        >

                          <td className="px-4 py-4 font-semibold">
                            {
                              session.session_number
                            }
                          </td>

                          <td className="px-4 py-4">
                            {
                              session.cashier_name
                            }
                          </td>

                          <td className="px-4 py-4">
                            {
                              session.branch_name
                            }
                          </td>

                          <td className="px-4 py-4">
                            {
                              dateTime(
                                session.closed_at
                              )
                            }
                          </td>

                          <td className="px-4 py-4 text-right">
                            {
                              money(
                                session.expected_cash
                              )
                            }
                          </td>

                          <td className="px-4 py-4 text-right">
                            {
                              money(
                                session.counted_cash
                              )
                            }
                          </td>

                          <td className="px-4 py-4 text-right font-bold">
                            {
                              money(
                                session.cash_difference
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
