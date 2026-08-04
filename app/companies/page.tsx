"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import DataTable from "@/components/DataTable";
import CompanyForm from "@/components/CompanyForm";
import AppButton from "@/components/ui/AppButton";

type Company = {
  id: string;
  company_name: string;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
};

type CompanyFormData = {
  company_name: string;
  email: string;
  phone: string;
  registration_number: string;
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("company")
      .select("*")
      .order("company_name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setCompanies(data ?? []);
  }

  async function saveCompany(company: CompanyFormData) {
    const { error } = await supabase
      .from("company")
      .insert(company);

    if (error) {
      throw new Error(error.message);
    }

    setMessage("Company saved successfully.");
    setShowForm(false);

    await loadCompanies();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const rows = companies.map((company) => [
    company.company_name,
    company.email ?? "-",
    company.phone ?? "-",
    company.registration_number ?? "-",
  ]);

  return (
    <DashboardLayout>
      <Navbar
        companyName="JINLAB"
        userName="JINLAB Admin"
        onLogout={logout}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1>Companies</h1>

        {!showForm && (
          <AppButton onClick={() => setShowForm(true)}>
            + Add Company
          </AppButton>
        )}
      </div>

      {message && (
        <p
          style={{
            marginBottom: "20px",
          }}
        >
          {message}
        </p>
      )}

      {showForm && (
        <div
          style={{
            marginBottom: "24px",
          }}
        >
          <CompanyForm
            onSave={saveCompany}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <DataTable
        headers={[
          "Company",
          "Email",
          "Phone",
          "Registration",
        ]}
        rows={rows}
      />
    </DashboardLayout>
  );
}
