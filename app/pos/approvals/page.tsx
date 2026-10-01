"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  Check,
  Clock3,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";


type ApprovalRow = {
  id: string;

  branch_id: string;
  branch_name: string;

  request_type:
    "discount" |
    "price_override";

  status: string;

  required_level:
    "manager" |
    "owner";

  requested_by: string;
  requested_by_name: string;

  reason: string;

  max_discount_pct: number;
  discount_amount: number;

  cart_snapshot: Array<{
    inventory_item_id: string;
    quantity: number;
    discount_mode: string;
    discount_value: number;
    requested_unit_price:
      number |
      null;
  }>;

  expires_at: string;
  created_at: string;
};


type ApprovalWorkspace = {
  ok: boolean;

  pending:
    ApprovalRow[];

  my_requests:
    ApprovalRow[];

  can_approve: boolean;
  can_owner_override: boolean;
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


  return new Date(
    value
  ).toLocaleString(
    "en-ZA"
  );
}


export default function PosApprovalsPage() {

  const router =
    useRouter();


  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();


  const canApprove =
    can(
      "pos.discount.approve"
    );


  const canOwnerOverride =
    can(
      "pos.discount.override"
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      ApprovalWorkspace |
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
    workingId,
    setWorkingId,
  ] =
    useState<
      string |
      null
    >(null);


  const [
    message,
    setMessage,
  ] =
    useState("");


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  async function load(
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
        data: {
          user,
        },
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
        data:
          profile,
        error:
          profileError,
      } =
        await supabase
          .from(
            "user_profile"
          )
          .select(
            "company_id"
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
          "Company profile could not be loaded."
        );
      }


      const [
        companyResult,
        approvalResult,
      ] =
        await Promise.all([
          supabase
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
            .single(),

          supabase.rpc(
            "get_pos_approval_workspace",
            {
              p_branch_id:
                null,
            }
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        approvalResult.error
      ) {
        throw approvalResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      setWorkspace(
        approvalResult.data as
          ApprovalWorkspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "POS approvals could not be loaded."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);
    }
  }


  useEffect(
    () => {

      if (
        permissionsLoading
      ) {
        return;
      }


      if (!canApprove) {

        queueMicrotask(
          () => {
            setLoading(
              false
            );
          }
        );

        return;
      }


      queueMicrotask(
        () => {
          void load();
        }
      );

    },
    [
      permissionsLoading,
      canApprove,
    ]
  );


  useEffect(() => {

    if (
      permissionsLoading ||
      !canApprove
    ) {
      return;
    }


    let active =
      true;


    async function refreshApprovals() {

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_pos_approval_workspace",
          {
            p_branch_id:
              null,
          }
        );


      if (
        !active ||
        error
      ) {
        return;
      }


      setWorkspace(
        data as
          ApprovalWorkspace
      );
    }


    const timer =
      window.setInterval(
        () => {
          void refreshApprovals();
        },
        4000
      );


    return () => {

      active =
        false;

      window.clearInterval(
        timer
      );
    };

  }, [
    permissionsLoading,
    canApprove,
  ]);


  async function review(
    row:
      ApprovalRow,

    decision:
      "approved" |
      "rejected"
  ) {

    if (
      row.required_level ===
        "owner" &&
      !canOwnerOverride
    ) {

      setErrorMessage(
        "This request requires Owner/Admin approval."
      );

      return;
    }


    const notes =
      window.prompt(
        decision ===
          "approved"
          ? "Optional approval note:"
          : "Reason for rejection:",
        ""
      );


    if (
      notes ===
      null
    ) {
      return;
    }


    const approved =
      window.confirm(
        decision ===
          "approved"
          ? `Approve this exact POS request for ${row.requested_by_name}?`
          : `Reject this POS request from ${row.requested_by_name}?`
      );


    if (!approved) {
      return;
    }


    try {

      setWorkingId(
        row.id
      );

      setMessage("");
      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "review_pos_approval",
          {
            p_approval_id:
              row.id,

            p_decision:
              decision,

            p_notes:
              notes.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setMessage(
        data?.message ??
        "Approval updated."
      );


      await load(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Approval could not be updated."
      );

    } finally {

      setWorkingId(
        null
      );
    }
  }


  async function logout() {

    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
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
          onLogout={
            logout
          }
        />

        <main className="mx-auto max-w-7xl p-6">

          <p className="text-sm text-muted-foreground">
            Loading POS approvals...
          </p>

        </main>

      </DashboardLayout>
    );
  }


  if (!canApprove) {

    return (
      <DashboardLayout>

        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={
            logout
          }
        />

        <main className="mx-auto max-w-5xl p-6">

          <div className="rounded-2xl border bg-card p-6">

            <h1 className="text-xl font-bold">
              Approval Workspace Restricted
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role cannot approve POS discounts or overrides.
            </p>

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
        onLogout={
          logout
        }
      />


      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">

          <div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/pos"
                )
              }
              className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <ArrowLeft className="h-4 w-4" />

              Point of Sale
            </button>


            <p className="text-sm font-medium text-muted-foreground">
              POS Control
            </p>


            <h1 className="mt-1 text-3xl font-bold">
              Approvals
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Review discounts and sensitive price overrides before checkout.
              Approvals are exact-cart, single-use and time limited.
            </p>

          </div>


          <Button
            type="button"
            variant="outline"
            disabled={
              refreshing
            }
            onClick={() =>
              void load(
                true
              )
            }
          >

            <RefreshCw
              className={`mr-2 h-4 w-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh

          </Button>

        </div>


        {
          message && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
              {
                message
              }
            </div>
          )
        }


        {
          errorMessage && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {
                errorMessage
              }
            </div>
          )
        }


        <div className="mb-6 rounded-2xl border bg-card p-5">

          <div className="flex items-start gap-3">

            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />

            <div>

              <h2 className="font-semibold">
                Approval Security
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                A manager cannot approve their own request.
                Owner/Admin approval is required for sensitive overrides.
                Approved requests expire after 15 minutes and can only be used once.
              </p>

            </div>

          </div>

        </div>


        <section>

          <div className="mb-4">

            <h2 className="text-xl font-bold">
              Pending Requests
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Review the reason, amount and required authority before approving.
            </p>

          </div>


          {
            !workspace ||
            workspace.pending.length ===
              0 ? (

              <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No POS approvals are waiting.
              </div>

            ) : (

              <div className="grid gap-4 lg:grid-cols-2">

                {
                  workspace.pending.map(
                    (
                      row
                    ) => {

                      const ownerRequired =
                        row.required_level ===
                        "owner";


                      const canReview =
                        !ownerRequired ||
                        canOwnerOverride;


                      return (
                        <div
                          key={
                            row.id
                          }
                          className="rounded-2xl border bg-card p-5"
                        >

                          <div className="flex items-start justify-between gap-4">

                            <div>

                              <p className="font-bold">
                                {
                                  row.request_type ===
                                    "price_override"
                                    ? "Price Override"
                                    : "Discount Approval"
                                }
                              </p>


                              <p className="mt-1 text-sm text-muted-foreground">
                                {
                                  row.requested_by_name
                                } · {
                                  row.branch_name
                                }
                              </p>

                            </div>


                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
                              {
                                ownerRequired
                                  ? "Owner/Admin"
                                  : "Manager"
                              }
                            </span>

                          </div>


                          <div className="mt-5 grid grid-cols-2 gap-4">

                            <div>

                              <p className="text-xs text-muted-foreground">
                                Maximum Reduction
                              </p>

                              <p className="mt-1 text-xl font-bold">
                                {
                                  Number(
                                    row.max_discount_pct
                                  ).toFixed(
                                    2
                                  )
                                }%
                              </p>

                            </div>


                            <div>

                              <p className="text-xs text-muted-foreground">
                                Value Reduced
                              </p>

                              <p className="mt-1 text-xl font-bold">
                                {
                                  money(
                                    row.discount_amount
                                  )
                                }
                              </p>

                            </div>

                          </div>


                          <div className="mt-4 rounded-xl bg-muted/50 p-3">

                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Reason
                            </p>

                            <p className="mt-2 text-sm">
                              {
                                row.reason
                              }
                            </p>

                          </div>


                          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">

                            <Clock3 className="h-4 w-4" />

                            Expires {
                              dateTime(
                                row.expires_at
                              )
                            }

                          </div>


                          {
                            !canReview && (
                              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                Owner/Admin approval is required.
                              </div>
                            )
                          }


                          <div className="mt-5 flex gap-2">

                            <Button
                              type="button"
                              disabled={
                                !canReview ||
                                workingId !==
                                  null
                              }
                              onClick={() =>
                                void review(
                                  row,
                                  "approved"
                                )
                              }
                              className="flex-1"
                            >
                              <Check className="mr-2 h-4 w-4" />

                              Approve
                            </Button>


                            <Button
                              type="button"
                              variant="outline"
                              disabled={
                                !canReview ||
                                workingId !==
                                  null
                              }
                              onClick={() =>
                                void review(
                                  row,
                                  "rejected"
                                )
                              }
                              className="flex-1"
                            >
                              <X className="mr-2 h-4 w-4" />

                              Reject
                            </Button>

                          </div>

                        </div>
                      );
                    }
                  )
                }

              </div>
            )
          }

        </section>

      </main>

    </DashboardLayout>
  );
}
