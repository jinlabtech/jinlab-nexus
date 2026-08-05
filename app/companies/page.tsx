"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import CompanyForm from "@/components/CompanyForm";
import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

import {
  createCompany,
  getCompanies,
  updateCompany,
  type Company,
  type CompanyFormData,
} from "@/lib/services/companyService";

import { supabase } from "@/lib/supabase";

export default function CompaniesPage() {
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] =
    useState<Company | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [companyName, setCompanyName] = useState("JINLAB");
  const [userName, setUserName] =
    useState("JINLAB Admin");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function initialisePage() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("user_profile")
        .select("full_name, company_id")
        .eq("user_id", user.id)
        .single();

      if (profileData?.full_name) {
        setUserName(profileData.full_name);
      }

      if (profileData?.company_id) {
        const { data: currentCompanyData } =
          await supabase
            .from("company")
            .select("company_name")
            .eq("id", profileData.company_id)
            .single();

        if (currentCompanyData?.company_name) {
          setCompanyName(
            currentCompanyData.company_name
          );
        }
      }

      await loadCompanies();
    }

    initialisePage();
  }, [router]);

  async function loadCompanies() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getCompanies();
      setCompanies(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Companies could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  function openAddForm() {
    setMessage("");
    setErrorMessage("");
    setEditingCompany(null);
    setShowForm(true);
  }

  function openEditForm(company: Company) {
    setMessage("");
    setErrorMessage("");
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
      await updateCompany(
        editingCompany.id,
        companyData
      );

      setMessage("Company updated successfully.");
    } else {
      await createCompany(companyData);

      setMessage("Company created successfully.");
    }

    closeForm();
    await loadCompanies();
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

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
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
