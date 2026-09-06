"use client";

import ActionModal from "@/components/ui/ActionModal";

import {
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import DataTable from "@/components/DataTable";
import InventoryCategoryForm from "@/components/InventoryCategoryForm";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";

import {
  createInventoryCategory,
  deleteInventoryCategory,
  updateInventoryCategory,
} from "@/lib/services/inventoryService";

import { supabase } from "@/lib/supabase";

import type {
  InventoryCategory,
  InventoryCategoryFormData,
} from "@/types/inventory";

export default function InventoryCategoriesPage() {
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
    editingCategory,
    setEditingCategory,
  ] = useState<InventoryCategory | null>(
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
    categories,
    loading,
    errorMessage:
      inventoryError,
    refreshInventory,
  } = useInventory(
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
      } =
        await supabase.auth.getUser();

      if (!user) {
        router.replace(
          "/login"
        );
        return;
      }

      const {
        data: profile,
        error,
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
        error ||
        !profile
      ) {
        setPageError(
          error?.message ??
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
    setEditingCategory(null);
    setShowForm(true);
    setMessage("");
    setPageError("");
  }

  function openEditForm(
    category: InventoryCategory
  ) {
    setEditingCategory(
      category
    );

    setShowForm(true);
    setMessage("");
    setPageError("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingCategory(null);
  }

  async function saveCategory(
    data: InventoryCategoryFormData
  ) {
    if (
      !currentCompanyId
    ) {
      throw new Error(
        "Company could not be identified."
      );
    }

    if (
      editingCategory
    ) {
      const updated =
        await updateInventoryCategory(
          editingCategory.id,
          currentCompanyId,
          data
        );

      await createAuditLog({
        company_id:
          currentCompanyId,

        action: "update",

        module:
          "inventory",

        record_id:
          updated.id,

        description:
          `Updated inventory category: ${updated.category_name}`,

        metadata: {
          category_name:
            updated.category_name,
        },
      });

      setMessage(
        "Category updated successfully."
      );
    } else {
      const created =
        await createInventoryCategory(
          currentCompanyId,
          data
        );

      await createAuditLog({
        company_id:
          currentCompanyId,

        action: "create",

        module:
          "inventory",

        record_id:
          created.id,

        description:
          `Created inventory category: ${created.category_name}`,

        metadata: {
          category_name:
            created.category_name,
        },
      });

      setMessage(
        "Category created successfully."
      );
    }

    closeForm();

    await refreshInventory();
  }

  async function removeCategory(
    category: InventoryCategory
  ) {
    const confirmed =
      window.confirm(
        `Delete category "${category.category_name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteInventoryCategory(
        category.id,
        currentCompanyId
      );

      await createAuditLog({
        company_id:
          currentCompanyId,

        action: "delete",

        module:
          "inventory",

        record_id:
          category.id,

        description:
          `Deleted inventory category: ${category.category_name}`,

        metadata: {
          category_name:
            category.category_name,
        },
      });

      setMessage(
        "Category deleted successfully."
      );

      await refreshInventory();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Category could not be deleted."
      );
    }
  }

  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }

  const rows =
    categories.map(
      (category) => [
        category.category_name,

        category.description ||
          "-",

        new Intl.DateTimeFormat(
          "en-ZA",
          {
            dateStyle:
              "medium",
          }
        ).format(
          new Date(
            category.created_at
          )
        ),

        <div
          key={
            category.id
          }
          className="flex flex-wrap gap-2"
        >
          {can(
            "inventory.update"
          ) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                openEditForm(
                  category
                )
              }
            >
              Edit
            </Button>
          )}

          {can(
            "inventory.delete"
          ) && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                removeCategory(
                  category
                )
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
              Inventory setup
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Categories
            </h1>

            <p className="mt-2 text-muted-foreground">
              Organise products,
              parts and components.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/inventory"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Inventory
            </Link>

            {can(
              "inventory.create"
            ) &&
              !showForm && (
                <Button
                  type="button"
                  onClick={
                    openAddForm
                  }
                >
                  + Add Category
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

        <ActionModal
          open={showForm}
          title={
            editingCategory
              ? "Edit Category"
              : "Add Category"
          }
          subtitle="Organise inventory into clear product groups."
          onClose={closeForm}
        >
          <InventoryCategoryForm
            category={
              editingCategory
            }
            onSave={
              saveCategory
            }
            onCancel={
              closeForm
            }
          />
        </ActionModal>

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            Loading categories...
          </div>
        ) : (
          <DataTable
            headers={[
              "Category",
              "Description",
              "Created",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No inventory categories yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
