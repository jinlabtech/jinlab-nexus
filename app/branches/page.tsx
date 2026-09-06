"use client";

import ActionModal from "@/components/ui/ActionModal";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import BranchForm from "@/components/BranchForm";
import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { useBranches } from "@/hooks/useBranches";
import { usePermissions } from "@/hooks/usePermissions";
import { createAuditLog } from "@/lib/services/auditLogService";
import {
  createBranch,
  deleteBranch,
  updateBranch,
} from "@/lib/services/branchService";
import { supabase } from "@/lib/supabase";

import type {
  Branch,
  BranchFormData,
} from "@/types/branch";

function formatCreatedDate(date: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
  }).format(new Date(date));
}

export default function BranchesPage() {
  const router = useRouter();

  const [currentCompanyId, setCurrentCompanyId] =
    useState("");
  const [companyName, setCompanyName] =
    useState("JINLAB");
  const [userName, setUserName] =
    useState("JINLAB Admin");

  const {
    branches,
    loading,
    errorMessage: branchesError,
    refreshBranches,
  } = useBranches(currentCompanyId);

  const {
    can,
    loading: permissionsLoading,
    errorMessage: permissionsError,
  } = usePermissions();

  const [showForm, setShowForm] =
    useState(false);
  const [editingBranch, setEditingBranch] =
    useState<Branch | null>(null);
  const [branchToDelete, setBranchToDelete] =
    useState<Branch | null>(null);

  const [searchTerm, setSearchTerm] =
    useState("");
  const [deleting, setDeleting] =
    useState(false);
  const [message, setMessage] =
    useState("");
  const [pageError, setPageError] =
    useState("");

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
        data: profileData,
        error: profileError,
      } = await supabase
        .from("user_profile")
        .select("full_name, company_id")
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        setPageError(profileError.message);
        return;
      }

      if (profileData?.full_name) {
        setUserName(profileData.full_name);
      }

      if (!profileData?.company_id) {
        setPageError(
          "Your account is not linked to a company."
        );
        return;
      }

      setCurrentCompanyId(
        profileData.company_id
      );

      const {
        data: companyData,
        error: companyError,
      } = await supabase
        .from("company")
        .select("company_name")
        .eq(
          "id",
          profileData.company_id
        )
        .single();

      if (companyError) {
        setPageError(companyError.message);
        return;
      }

      if (companyData?.company_name) {
        setCompanyName(
          companyData.company_name
        );
      }
    }

    initialisePage();
  }, [router]);

  function openAddForm() {
    if (!can("branch.create")) {
      setPageError(
        "You do not have permission to create branches."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setEditingBranch(null);
    setShowForm(true);
  }

  function openEditForm(branch: Branch) {
    if (!can("branch.update")) {
      setPageError(
        "You do not have permission to edit branches."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setEditingBranch(branch);
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeForm() {
    setShowForm(false);
    setEditingBranch(null);
  }

  async function saveBranch(
    branchData: BranchFormData
  ) {
    if (!currentCompanyId) {
      throw new Error(
        "Your account is not linked to a company."
      );
    }

    if (editingBranch) {
      if (!can("branch.update")) {
        throw new Error(
          "You do not have permission to update branches."
        );
      }

      const updatedBranch =
        await updateBranch(
          editingBranch.id,
          currentCompanyId,
          branchData
        );

      try {
        await createAuditLog({
          company_id: currentCompanyId,
          action: "update",
          module: "branches",
          record_id: updatedBranch.id,
          description: `Updated branch: ${updatedBranch.branch_name}`,
          metadata: {
            branch_name:
              updatedBranch.branch_name,
            address:
              updatedBranch.address,
          },
        });
      } catch (error) {
        setPageError(
          error instanceof Error
            ? `Branch updated, but audit logging failed: ${error.message}`
            : "Branch updated, but audit logging failed."
        );
      }

      setMessage(
        "Branch updated successfully."
      );
    } else {
      if (!can("branch.create")) {
        throw new Error(
          "You do not have permission to create branches."
        );
      }

      const createdBranch =
        await createBranch(
          currentCompanyId,
          branchData
        );

      try {
        await createAuditLog({
          company_id: currentCompanyId,
          action: "create",
          module: "branches",
          record_id: createdBranch.id,
          description: `Created branch: ${createdBranch.branch_name}`,
          metadata: {
            branch_name:
              createdBranch.branch_name,
            address:
              createdBranch.address,
          },
        });
      } catch (error) {
        setPageError(
          error instanceof Error
            ? `Branch created, but audit logging failed: ${error.message}`
            : "Branch created, but audit logging failed."
        );
      }

      setMessage(
        "Branch created successfully."
      );
    }

    closeForm();
    await refreshBranches();
  }

  function requestDeleteBranch(
    branch: Branch
  ) {
    if (!can("branch.delete")) {
      setPageError(
        "You do not have permission to delete branches."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setBranchToDelete(branch);
  }

  async function confirmDeleteBranch() {
    if (
      !branchToDelete ||
      !currentCompanyId
    ) {
      return;
    }

    if (!can("branch.delete")) {
      setPageError(
        "You do not have permission to delete branches."
      );
      setBranchToDelete(null);
      return;
    }

    setDeleting(true);
    setMessage("");
    setPageError("");

    try {
      const deletedBranch =
        branchToDelete;

      await deleteBranch(
        deletedBranch.id,
        currentCompanyId
      );

      try {
        await createAuditLog({
          company_id: currentCompanyId,
          action: "delete",
          module: "branches",
          record_id: deletedBranch.id,
          description: `Deleted branch: ${deletedBranch.branch_name}`,
          metadata: {
            branch_name:
              deletedBranch.branch_name,
            address:
              deletedBranch.address,
          },
        });
      } catch (error) {
        setPageError(
          error instanceof Error
            ? `Branch deleted, but audit logging failed: ${error.message}`
            : "Branch deleted, but audit logging failed."
        );
      }

      setBranchToDelete(null);

      setMessage(
        "Branch deleted successfully."
      );

      await refreshBranches();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "The branch could not be deleted."
      );
    } finally {
      setDeleting(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const filteredBranches = useMemo(() => {
    const search =
      searchTerm.trim().toLowerCase();

    if (!search) {
      return branches;
    }

    return branches.filter((branch) =>
      [
        branch.branch_name,
        branch.address,
      ].some((value) =>
        value
          ?.toLowerCase()
          .includes(search)
      )
    );
  }, [branches, searchTerm]);

  const rows = filteredBranches.map(
    (branch) => [
      <div key={`${branch.id}-name`}>
        <p className="font-semibold">
          {branch.branch_name}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          ID: {branch.id.slice(0, 8)}
        </p>
      </div>,

      branch.address || "-",

      <span
        key={`${branch.id}-status`}
        className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
      >
        Active
      </span>,

      formatCreatedDate(
        branch.created_at
      ),

      <div
        key={`${branch.id}-actions`}
        className="flex flex-wrap gap-2"
      >
        {can("branch.update") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              openEditForm(branch)
            }
          >
            Edit
          </Button>
        )}

        {can("branch.delete") && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() =>
              requestDeleteBranch(branch)
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
    branchesError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can("branch.view")
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
              to view the Branches module.
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
              Location management
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Branches
            </h1>

            <p className="mt-2 text-muted-foreground">
              Create and manage the
              business locations
              belonging to{" "}
              {companyName}.
            </p>
          </div>

          {!showForm &&
            can("branch.create") && (
              <Button
                type="button"
                onClick={openAddForm}
                disabled={
                  !currentCompanyId
                }
              >
                + Add Branch
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

        <ActionModal
          open={showForm}
          title={
            editingBranch
              ? "Edit Branch"
              : "Add Branch"
          }
          subtitle="Maintain business location details."
          onClose={closeForm}
        >
          <BranchForm
            branch={editingBranch}
            onSave={saveBranch}
            onCancel={closeForm}
          />
        </ActionModal>

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Registered branches
            </p>

            <p className="text-sm text-muted-foreground">
              {filteredBranches.length}{" "}
              result
              {filteredBranches.length ===
              1
                ? ""
                : "s"}
            </p>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search branches..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading branches...
          </div>
        ) : (
          <DataTable
            headers={[
              "Branch",
              "Address",
              "Status",
              "Created",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No branches match your search."
          />
        )}
      </main>

      <AlertDialog
        open={Boolean(branchToDelete)}
        onOpenChange={(open) => {
          if (
            !open &&
            !deleting
          ) {
            setBranchToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete branch?
            </AlertDialogTitle>

            <AlertDialogDescription>
              This will permanently
              delete{" "}
              <strong>
                {
                  branchToDelete?.branch_name
                }
              </strong>
              . This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              onClick={
                confirmDeleteBranch
              }
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? "Deleting..."
                : "Delete Branch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
