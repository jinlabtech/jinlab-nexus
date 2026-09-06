"use client";

import ActionModal from "@/components/ui/ActionModal";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import CompanyForm from "@/components/CompanyForm";
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

import { useCompanies } from "@/hooks/useCompanies";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";

import {
  createCompany,
  deleteCompany,
  updateCompany,
} from "@/lib/services/companyService";

import { supabase } from "@/lib/supabase";

import type {
  Company,
  CompanyFormData,
} from "@/types/company";

export default function CompaniesPage() {
  const router = useRouter();

  const {
    companies,
    loading,
    errorMessage: companiesError,
    refreshCompanies,
  } = useCompanies();

  const {
    can,
    loading: permissionsLoading,
    errorMessage: permissionsError,
  } = usePermissions();

  const [showForm, setShowForm] =
    useState(false);

  const [editingCompany, setEditingCompany] =
    useState<Company | null>(null);

  const [companyToDelete, setCompanyToDelete] =
    useState<Company | null>(null);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [currentCompanyId, setCurrentCompanyId] =
    useState("");

  const [companyName, setCompanyName] =
    useState("JINLAB");

  const [userName, setUserName] =
    useState("JINLAB Admin");

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
        .select(
          "full_name, company_id"
        )
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        setPageError(
          profileError.message
        );
        return;
      }

      if (profileData?.full_name) {
        setUserName(
          profileData.full_name
        );
      }

      if (profileData?.company_id) {
        setCurrentCompanyId(
          profileData.company_id
        );

        const {
          data: currentCompanyData,
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
          setPageError(
            companyError.message
          );
          return;
        }

        if (
          currentCompanyData?.company_name
        ) {
          setCompanyName(
            currentCompanyData.company_name
          );
        }
      }
    }

    initialisePage();
  }, [router]);

  function openAddForm() {
    if (!can("company.create")) {
      setPageError(
        "You do not have permission to create companies."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setEditingCompany(null);
    setShowForm(true);
  }

  function openEditForm(
    company: Company
  ) {
    if (!can("company.update")) {
      setPageError(
        "You do not have permission to edit companies."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setEditingCompany(company);
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeForm() {
    setShowForm(false);
    setEditingCompany(null);
  }

  async function saveCompany(
    companyData: CompanyFormData
  ) {
    if (editingCompany) {
      if (!can("company.update")) {
        throw new Error(
          "You do not have permission to update companies."
        );
      }

      const updatedCompany =
        await updateCompany(
          editingCompany.id,
          companyData
        );

      if (currentCompanyId) {
        try {
          await createAuditLog({
            company_id:
              currentCompanyId,
            action: "update",
            module: "companies",
            record_id:
              updatedCompany.id,
            description:
              `Updated company: ${updatedCompany.company_name}`,
            metadata: {
              company_name:
                updatedCompany.company_name,
              email:
                updatedCompany.email,
              phone:
                updatedCompany.phone,
              registration_number:
                updatedCompany.registration_number,
            },
          });
        } catch (error) {
          setPageError(
            error instanceof Error
              ? `Company updated, but audit logging failed: ${error.message}`
              : "Company updated, but audit logging failed."
          );
        }
      }

      setMessage(
        "Company updated successfully."
      );
    } else {
      if (!can("company.create")) {
        throw new Error(
          "You do not have permission to create companies."
        );
      }

      const createdCompany =
        await createCompany(
          companyData
        );

      if (currentCompanyId) {
        try {
          await createAuditLog({
            company_id:
              currentCompanyId,
            action: "create",
            module: "companies",
            record_id:
              createdCompany.id,
            description:
              `Created company: ${createdCompany.company_name}`,
            metadata: {
              company_name:
                createdCompany.company_name,
              email:
                createdCompany.email,
              phone:
                createdCompany.phone,
              registration_number:
                createdCompany.registration_number,
            },
          });
        } catch (error) {
          setPageError(
            error instanceof Error
              ? `Company created, but audit logging failed: ${error.message}`
              : "Company created, but audit logging failed."
          );
        }
      }

      setMessage(
        "Company created successfully."
      );
    }

    closeForm();

    await refreshCompanies();
  }

  function requestDeleteCompany(
    company: Company
  ) {
    if (!can("company.delete")) {
      setPageError(
        "You do not have permission to delete companies."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setCompanyToDelete(company);
  }

  async function confirmDeleteCompany() {
    if (!companyToDelete) {
      return;
    }

    if (!can("company.delete")) {
      setPageError(
        "You do not have permission to delete companies."
      );

      setCompanyToDelete(null);
      return;
    }

    if (
      companyToDelete.id ===
      currentCompanyId
    ) {
      setPageError(
        "You cannot delete the company currently linked to your account."
      );

      setCompanyToDelete(null);
      return;
    }

    setDeleting(true);
    setMessage("");
    setPageError("");

    try {
      const deletedCompany =
        companyToDelete;

      await deleteCompany(
        deletedCompany.id
      );

      if (currentCompanyId) {
        try {
          await createAuditLog({
            company_id:
              currentCompanyId,
            action: "delete",
            module: "companies",
            record_id:
              deletedCompany.id,
            description:
              `Deleted company: ${deletedCompany.company_name}`,
            metadata: {
              company_name:
                deletedCompany.company_name,
              email:
                deletedCompany.email,
              phone:
                deletedCompany.phone,
              registration_number:
                deletedCompany.registration_number,
            },
          });
        } catch (error) {
          setPageError(
            error instanceof Error
              ? `Company deleted, but audit logging failed: ${error.message}`
              : "Company deleted, but audit logging failed."
          );
        }
      }

      setCompanyToDelete(null);

      setMessage(
        "Company deleted successfully."
      );

      await refreshCompanies();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "The company could not be deleted."
      );
    } finally {
      setDeleting(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const filteredCompanies =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return companies;
      }

      return companies.filter(
        (company) =>
          [
            company.company_name,
            company.email,
            company.phone,
            company.registration_number,
          ].some((value) =>
            value
              ?.toLowerCase()
              .includes(search)
          )
      );
    }, [
      companies,
      searchTerm,
    ]);

  const rows =
    filteredCompanies.map(
      (company) => [
        <div
          key={`${company.id}-name`}
        >
          <p className="font-semibold">
            {company.company_name}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            ID:{" "}
            {company.id.slice(0, 8)}
          </p>
        </div>,

        company.email || "-",

        company.phone || "-",

        company.registration_number ||
          "-",

        <span
          key={`${company.id}-status`}
          className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
        >
          Active
        </span>,

        <div
          key={`${company.id}-actions`}
          className="flex flex-wrap gap-2"
        >
          {can(
            "company.update"
          ) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                openEditForm(company)
              }
            >
              Edit
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
          >
            View
          </Button>

          {can(
            "company.delete"
          ) && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                requestDeleteCompany(
                  company
                )
              }
              disabled={
                company.id ===
                currentCompanyId
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
    companiesError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can("company.view")
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
              You do not have
              permission to view the
              Companies module.
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
              Organisation
              management
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Companies
            </h1>

            <p className="mt-2 text-muted-foreground">
              Create and manage
              organisations registered
              in JINLAB Nexus.
            </p>
          </div>

          {!showForm &&
            can(
              "company.create"
            ) && (
              <Button
                type="button"
                onClick={
                  openAddForm
                }
              >
                + Add Company
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

        {permissionsLoading ? (
          <div className="mb-6 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            Loading permissions...
          </div>
        ) : null}

        <ActionModal
          open={showForm}
          title={
            editingCompany
              ? "Edit Company"
              : "Add Company"
          }
          subtitle="Maintain organisation information."
          onClose={closeForm}
          maxWidth="max-w-4xl"
        >
          <CompanyForm
            company={
              editingCompany
            }
            onSave={
              saveCompany
            }
            onCancel={
              closeForm
            }
          />
        </ActionModal>

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Registered companies
            </p>

            <p className="text-sm text-muted-foreground">
              {
                filteredCompanies.length
              }{" "}
              result
              {filteredCompanies.length ===
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
            placeholder="Search companies..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading companies...
          </div>
        ) : (
          <DataTable
            headers={[
              "Company",
              "Email",
              "Phone",
              "Registration",
              "Status",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No companies match your search."
          />
        )}
      </main>

      <AlertDialog
        open={Boolean(
          companyToDelete
        )}
        onOpenChange={(open) => {
          if (
            !open &&
            !deleting
          ) {
            setCompanyToDelete(
              null
            );
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete company?
            </AlertDialogTitle>

            <AlertDialogDescription>
              This will permanently
              delete{" "}
              <strong>
                {
                  companyToDelete?.company_name
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
                confirmDeleteCompany
              }
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? "Deleting..."
                : "Delete Company"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
