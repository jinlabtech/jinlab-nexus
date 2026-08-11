"use client";

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import SupplierForm from "@/components/SupplierForm";
import { Button } from "@/components/ui/button";

import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";

import {
  createSupplier,
  deleteSupplier,
  updateSupplier,
} from "@/lib/services/inventoryService";

import { supabase } from "@/lib/supabase";

import type {
  Supplier,
  SupplierFormData,
} from "@/types/inventory";

export default function SuppliersPage() {
  const router = useRouter();

  const [currentCompanyId, setCurrentCompanyId] =
    useState("");

  const [companyName, setCompanyName] =
    useState("JINLAB");

  const [userName, setUserName] =
    useState("JINLAB Admin");

  const [editingSupplier, setEditingSupplier] =
    useState<Supplier | null>(null);

  const [showForm, setShowForm] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [pageError, setPageError] =
    useState("");

  const {
    suppliers,
    loading,
    errorMessage: inventoryError,
    refreshInventory,
  } = useInventory(currentCompanyId);

  const {
    can,
    loading: permissionsLoading,
    errorMessage: permissionsError,
  } = usePermissions();

  useEffect(() => {
    async function initialisePage() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("user_profile")
        .select("full_name, company_id")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile) {
        setPageError(
          profileError?.message ??
            "Profile could not be loaded."
        );
        return;
      }

      setUserName(profile.full_name);

      if (!profile.company_id) {
        setPageError(
          "Your account is not linked to a company."
        );
        return;
      }

      setCurrentCompanyId(profile.company_id);

      const {
        data: company,
        error: companyError,
      } = await supabase
        .from("company")
        .select("company_name")
        .eq("id", profile.company_id)
        .single();

      if (companyError) {
        setPageError(companyError.message);
        return;
      }

      if (company?.company_name) {
        setCompanyName(company.company_name);
      }
    }

    initialisePage();
  }, [router]);

  function openAddForm() {
    if (!can("supplier.create")) {
      setPageError(
        "You do not have permission to create suppliers."
      );
      return;
    }

    setEditingSupplier(null);
    setShowForm(true);
    setMessage("");
    setPageError("");
  }

  function openEditForm(
    supplier: Supplier
  ) {
    if (!can("supplier.update")) {
      setPageError(
        "You do not have permission to edit suppliers."
      );
      return;
    }

    setEditingSupplier(supplier);
    setShowForm(true);
    setMessage("");
    setPageError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeForm() {
    setShowForm(false);
    setEditingSupplier(null);
  }

  async function saveSupplier(
    data: SupplierFormData
  ) {
    if (!currentCompanyId) {
      throw new Error(
        "Company could not be identified."
      );
    }

    if (editingSupplier) {
      if (!can("supplier.update")) {
        throw new Error(
          "You do not have permission to update suppliers."
        );
      }

      const updated =
        await updateSupplier(
          editingSupplier.id,
          currentCompanyId,
          data
        );

      try {
        await createAuditLog({
          company_id: currentCompanyId,
          action: "update",
          module: "suppliers",
          record_id: updated.id,
          description:
            `Updated supplier: ${updated.supplier_name}`,
          metadata: {
            supplier_name:
              updated.supplier_name,
            contact_person:
              updated.contact_person,
            email:
              updated.email,
            phone:
              updated.phone,
          },
        });
      } catch (error) {
        setPageError(
          error instanceof Error
            ? `Supplier updated, but audit logging failed: ${error.message}`
            : "Supplier updated, but audit logging failed."
        );
      }

      setMessage(
        "Supplier updated successfully."
      );
    } else {
      if (!can("supplier.create")) {
        throw new Error(
          "You do not have permission to create suppliers."
        );
      }

      const created =
        await createSupplier(
          currentCompanyId,
          data
        );

      try {
        await createAuditLog({
          company_id: currentCompanyId,
          action: "create",
          module: "suppliers",
          record_id: created.id,
          description:
            `Created supplier: ${created.supplier_name}`,
          metadata: {
            supplier_name:
              created.supplier_name,
            contact_person:
              created.contact_person,
            email:
              created.email,
            phone:
              created.phone,
          },
        });
      } catch (error) {
        setPageError(
          error instanceof Error
            ? `Supplier created, but audit logging failed: ${error.message}`
            : "Supplier created, but audit logging failed."
        );
      }

      setMessage(
        "Supplier created successfully."
      );
    }

    closeForm();
    await refreshInventory();
  }

  async function removeSupplier(
    supplier: Supplier
  ) {
    if (!can("supplier.delete")) {
      setPageError(
        "You do not have permission to delete suppliers."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Delete supplier "${supplier.supplier_name}"?`
      );

    if (!confirmed) {
      return;
    }

    setMessage("");
    setPageError("");

    try {
      await deleteSupplier(
        supplier.id,
        currentCompanyId
      );

      try {
        await createAuditLog({
          company_id: currentCompanyId,
          action: "delete",
          module: "suppliers",
          record_id: supplier.id,
          description:
            `Deleted supplier: ${supplier.supplier_name}`,
          metadata: {
            supplier_name:
              supplier.supplier_name,
          },
        });
      } catch (error) {
        setPageError(
          error instanceof Error
            ? `Supplier deleted, but audit logging failed: ${error.message}`
            : "Supplier deleted, but audit logging failed."
        );
      }

      setMessage(
        "Supplier deleted successfully."
      );

      await refreshInventory();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Supplier could not be deleted."
      );
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const rows = suppliers.map(
    (supplier) => [
      <div key={`${supplier.id}-name`}>
        <p className="font-semibold">
          {supplier.supplier_name}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          ID: {supplier.id.slice(0, 8)}
        </p>
      </div>,

      supplier.contact_person || "-",

      supplier.email || "-",

      supplier.phone || "-",

      supplier.address || "-",

      <div
        key={`${supplier.id}-actions`}
        className="flex flex-wrap gap-2"
      >
        {can("supplier.update") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              openEditForm(supplier)
            }
          >
            Edit
          </Button>
        )}

        {can("supplier.delete") && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() =>
              removeSupplier(supplier)
            }
          >
            Delete
          </Button>
        )}
      </div>,
    ]
  );

  const visibleError =
    pageError ||
    inventoryError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can("supplier.view")
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={companyName}
          userName={userName}
          onLogout={logout}
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            <h1 className="text-xl font-semibold">
              Access denied
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              You do not have permission
              to view Suppliers.
            </p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={companyName}
        userName={userName}
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Procurement
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Suppliers
            </h1>

            <p className="mt-2 text-muted-foreground">
              Maintain supplier contacts
              and procurement information
              for {companyName}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/inventory"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Inventory
            </Link>

            {can("supplier.create") &&
              !showForm && (
                <Button
                  type="button"
                  onClick={openAddForm}
                >
                  + Add Supplier
                </Button>
              )}
          </div>
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
            <SupplierForm
              supplier={
                editingSupplier
              }
              onSave={
                saveSupplier
              }
              onCancel={
                closeForm
              }
            />
          </div>
        )}

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading suppliers...
          </div>
        ) : (
          <DataTable
            headers={[
              "Supplier",
              "Contact",
              "Email",
              "Phone",
              "Address",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No suppliers yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
