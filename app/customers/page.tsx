"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import CustomerForm from "@/components/CustomerForm";
import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

import { useCustomers } from "@/hooks/useCustomers";
import { usePermissions } from "@/hooks/usePermissions";

import {
  archiveCustomer,
  createCustomer,
  updateCustomer,
} from "@/lib/services/customerService";

import { createAuditLog } from "@/lib/services/auditLogService";

import { supabase } from "@/lib/supabase";

import type {
  Customer,
  CustomerFormData,
} from "@/types/customer";

export default function CustomersPage() {
  const router = useRouter();

  const [
    currentCompanyId,
    setCurrentCompanyId,
  ] = useState("");

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
    editingCustomer,
    setEditingCustomer,
  ] = useState<Customer | null>(
    null
  );

  const [
    showForm,
    setShowForm,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState("");

  const {
    customers,
    loading,
    errorMessage:
      customersError,
    refreshCustomers,
  } = useCustomers(
    currentCompanyId
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

  function openAddForm() {
    setEditingCustomer(null);
    setShowForm(true);
    setMessage("");
    setPageError("");
  }

  function openEditForm(
    customer: Customer
  ) {
    setEditingCustomer(
      customer
    );

    setShowForm(true);
    setMessage("");
    setPageError("");
  }

  function closeForm() {
    setEditingCustomer(null);
    setShowForm(false);
  }

  async function saveCustomer(
    data: CustomerFormData
  ) {
    if (!currentCompanyId) {
      throw new Error(
        "Company could not be identified."
      );
    }

    if (editingCustomer) {
      const updated =
        await updateCustomer(
          editingCustomer.id,
          currentCompanyId,
          data
        );

      await createAuditLog({
        company_id:
          currentCompanyId,
        action:
          "update",
        module:
          "customers",
        record_id:
          updated.id,
        description:
          `Updated customer: ${updated.customer_name}`,
        metadata: {
          customer_number:
            updated.customer_number,
          customer_type:
            updated.customer_type,
        },
      });

      setMessage(
        "Customer updated successfully."
      );
    } else {
      const created =
        await createCustomer(
          currentCompanyId,
          data
        );

      await createAuditLog({
        company_id:
          currentCompanyId,
        action:
          "create",
        module:
          "customers",
        record_id:
          created.id,
        description:
          `Created customer: ${created.customer_name}`,
        metadata: {
          customer_number:
            created.customer_number,
          customer_type:
            created.customer_type,
        },
      });

      setMessage(
        "Customer created successfully."
      );
    }

    closeForm();
    await refreshCustomers();
  }

  async function removeCustomer(
    customer: Customer
  ) {
    const confirmed =
      window.confirm(
        `Archive customer "${customer.customer_name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await archiveCustomer(
        customer.id,
        currentCompanyId
      );

      await createAuditLog({
        company_id:
          currentCompanyId,
        action:
          "delete",
        module:
          "customers",
        record_id:
          customer.id,
        description:
          `Archived customer: ${customer.customer_name}`,
        metadata: {
          customer_number:
            customer.customer_number,
        },
      });

      setMessage(
        "Customer archived successfully."
      );

      await refreshCustomers();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Customer could not be archived."
      );
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const filteredCustomers =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return customers;
      }

      return customers.filter(
        (customer) =>
          [
            customer.customer_number,
            customer.customer_name,
            customer.contact_person,
            customer.email,
            customer.phone,
            customer.customer_type,
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
      customers,
      searchTerm,
    ]);

  const rows =
    filteredCustomers.map(
      (customer) => [
        <div
          key={`${customer.id}-customer`}
        >
          <p className="font-semibold">
            {
              customer.customer_name
            }
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {
              customer.customer_number
            }
          </p>
        </div>,

        customer.customer_type,

        customer.contact_person ||
          "-",

        customer.phone ||
          "-",

        customer.email ||
          "-",

        customer.payment_terms_days ===
        0
          ? "Cash"
          : `${customer.payment_terms_days} days`,

        <div
          key={`${customer.id}-actions`}
          className="flex flex-wrap gap-2"
        >
          {can(
            "customer.update"
          ) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                openEditForm(
                  customer
                )
              }
            >
              Edit
            </Button>
          )}

          {can(
            "customer.delete"
          ) && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                removeCustomer(
                  customer
                )
              }
            >
              Archive
            </Button>
          )}
        </div>,
      ]
    );

  const visibleError =
    pageError ||
    customersError ||
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
              CRM
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Customers
            </h1>

            <p className="mt-2 text-muted-foreground">
              Individuals,
              businesses, schools and
              organisations.
            </p>
          </div>

          {can(
            "customer.create"
          ) &&
            !showForm && (
              <Button
                type="button"
                onClick={
                  openAddForm
                }
              >
                + Add Customer
              </Button>
            )}
        </section>

        {message && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {visibleError}
          </div>
        )}

        {showForm && (
          <div className="mb-8">
            <CustomerForm
              customer={
                editingCustomer
              }
              onSave={
                saveCustomer
              }
              onCancel={
                closeForm
              }
            />
          </div>
        )}

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Customer Directory
            </p>

            <p className="text-sm text-muted-foreground">
              {
                filteredCustomers.length
              }{" "}
              customer
              {filteredCustomers.length ===
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
            placeholder="Search customers..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-sm"
          />
        </section>

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border p-10 text-center">
            Loading customers...
          </div>
        ) : (
          <DataTable
            headers={[
              "Customer",
              "Type",
              "Contact",
              "Phone",
              "Email",
              "Terms",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No customers yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
