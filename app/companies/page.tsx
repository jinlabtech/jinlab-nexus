"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import CompanyForm from "@/components/CompanyForm";
import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

import { useCompanies } from "@/hooks/useCompanies";
import { createAuditLog } from "@/lib/services/auditLogService";
import {
  createCompany,
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

  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] =
    useState<Company | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [currentCompanyId, setCurrentCompanyId] =
    useState("");
  const [companyName, setCompanyName] = useState("JINLAB");
  const [userName, setUserName] =
    useState("JINLAB Admin");

  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");

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

      if (profileData?.company_id) {
        setCurrentCompanyId(profileData.company_id);

        const {
          data: currentCompanyData,
          error: companyError,
        } = await supabase
          .from("company")
          .select("company_name")
          .eq("id", profileData.company_id)
          .single();

        if (companyError) {
          setPageError(companyError.message);
          return;
        }

        if (currentCompanyData?.company_name) {
          setCompanyName(
            currentCompanyData.company_name
          );
        }
      }
    }

    initialisePage();
  }, [router]);

  function openAddForm() {
    setMessage("");
    setPageError("");
    setEditingCompany(null);
    setShowForm(true);
  }

  function openEditForm(company: Company) {
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

  async function recordAuditLog({
    action,
    recordId,
    description,
    metadata,
  }: {
    action: "create" | "update";
    recordId: string;
    description: string;
    metadata: Record<string, unknown>;
  }) {
    if (!currentCompanyId) {
      setPageError(
        "The action succeeded, but the audit log could not be created because your account has no company."
      );
      return;
    }

    try {
      await createAuditLog({
        company_id: currentCompanyId,
        action,
        module: "companies",
        record_id: recordId,
        description,
        metadata,
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? `The company action succeeded, but audit logging failed: ${error.message}`
          : "The company action succeeded, but audit logging failed."
      );
    }
  }

  async function saveCompany(
    companyData: CompanyFormData
  ) {
    if (editingCompany) {
      const updatedCompany = await updateCompany(
        editingCompany.id,
        companyData
      );

      await recordAuditLog({
        action: "update",
        recordId: updatedCompany.id,
        description: `Updated company: ${updatedCompany.company_name}`,
        metadata: {
          company_name: updatedCompany.company_name,
          email: updatedCompany.email,
          phone: updatedCompany.phone,
          registration_number:
            updatedCompany.registration_number,
        },
      });

      setMessage("Company updated successfully.");
    } else {
      const createdCompany = await createCompany(
        companyData
      );

      await recordAuditLog({
        action: "create",
        recordId: createdCompany.id,
        description: `Created company: ${createdCompany.company_name}`,
        metadata: {
          company_name: createdCompany.company_name,
          email: createdCompany.email,
          phone: createdCompany.phone,
          registration_number:
            createdCompany.registration_number,
        },
      });

      setMessage("Company created successfully.");
    }

    closeForm();
    await refreshCompanies();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const filteredCompanies = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return companies;
    }

    return companies.filter((company) =>
      [
        company.company_name,
        company.email,
        company.phone,
        company.registration_number,
      ].some((value) =>
        value?.toLowerCase().includes(search)
      )
    );
  }, [companies, searchTerm]);

  const rows = filteredCompanies.map((company) => [
    <div key={`${company.id}-name`}>
      <p className="font-semibold">
        {company.company_name}
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        ID: {company.id.slice(0, 8)}
      </p>
    </div>,

    company.email || "-",
    company.phone || "-",
    company.registration_number || "-",

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => openEditForm(company)}
      >
        Edit
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
      >
        View
      </Button>
    </div>,
  ]);

  const visibleError = pageError || companiesError;

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
              Organisation management
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Companies
            </h1>

            <p className="mt-2 text-muted-foreground">
              Create and manage organisations registered in
              JINLAB Nexus.
            </p>
          </div>

          {!showForm && (
            <Button
              type="button"
              onClick={openAddForm}
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

        {showForm && (
          <div className="mb-8">
            <CompanyForm
              company={editingCompany}
              onSave={saveCompany}
              onCancel={closeForm}
            />
          </div>
        )}

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Registered companies
            </p>

            <p className="text-sm text-muted-foreground">
              {filteredCompanies.length} result
              {filteredCompanies.length === 1 ? "" : "s"}
            </p>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            placeholder="Search companies..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading ? (
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
    </DashboardLayout>
  );
}
