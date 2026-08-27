"use client";

import {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import SalesOrderForm from "@/components/SalesOrderForm";

import {
  createSalesOrder,
} from "@/lib/services/salesService";

import { supabase } from "@/lib/supabase";

import type {
  Customer,
} from "@/types/customer";

type BranchOption = {
  id: string;
  branch_name: string;
};

type FormValues = {
  customer_id: string;
  branch_id: string;
  expected_delivery: string | null;
  notes: string | null;
};

export default function NewSalesOrderPage() {
  const router = useRouter();

  const [
    companyId,
    setCompanyId,
  ] = useState<string | null>(
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
    customers,
    setCustomers,
  ] = useState<Customer[]>([]);

  const [
    branches,
    setBranches,
  ] =
    useState<BranchOption[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    async function initialise() {
      try {
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
          !profile?.company_id
        ) {
          throw new Error(
            profileError?.message ??
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

        const [
          companyResult,
          customerResult,
          branchResult,
        ] =
          await Promise.all([
            supabase
              .from("company")
              .select(
                "company_name"
              )
              .eq(
                "id",
                profile.company_id
              )
              .single(),

            supabase
              .from("customer")
              .select("*")
              .eq(
                "company_id",
                profile.company_id
              )
              .order(
                "customer_name"
              ),

            supabase
              .from("branch")
              .select(
                "id, branch_name"
              )
              .eq(
                "company_id",
                profile.company_id
              )
              .order(
                "branch_name"
              ),
          ]);

        if (
          companyResult.error
        ) {
          throw new Error(
            companyResult.error
              .message
          );
        }

        if (
          customerResult.error
        ) {
          throw new Error(
            customerResult.error
              .message
          );
        }

        if (
          branchResult.error
        ) {
          throw new Error(
            branchResult.error
              .message
          );
        }

        setCompanyName(
          companyResult.data
            .company_name
        );

        setCustomers(
          (customerResult.data ??
            []) as Customer[]
        );

        setBranches(
          branchResult.data ??
            []
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Sales order page could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    initialise();
  }, [router]);

  async function handleCreate(
    values: FormValues
  ) {
    if (!companyId) {
      throw new Error(
        "Company is not available."
      );
    }

    setSubmitting(true);

    try {
      const order =
        await createSalesOrder(
          companyId,
          {
            ...values,
            quotation_id:
              null,
          }
        );

      router.push(
        `/sales/${order.id}`
      );
    } finally {
      setSubmitting(false);
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
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/sales"
              )
            }
            className="mb-5 text-sm font-medium text-primary hover:underline"
          >
            ← Sales Orders
          </button>

          <div className="mb-8">
            <p className="text-sm font-medium text-primary">
              Sales
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              New Sales Order
            </h1>

            <p className="mt-2 text-muted-foreground">
              Create a draft customer order. Products and services can be added after the order is created.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6">
              <SalesOrderForm
                customers={
                  customers
                }
                branches={
                  branches
                }
                submitting={
                  submitting
                }
                onSubmit={
                  handleCreate
                }
              />
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
