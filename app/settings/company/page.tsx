"use client";

import {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import { usePermissions } from "@/hooks/usePermissions";

import { supabase } from "@/lib/supabase";

import {
  getCompanyProfileSettings,
  saveCompanyProfileSettings,
  type CompanyProfileSettings,
} from "@/lib/services/settingsService";

export default function CompanySettingsPage() {
  const router = useRouter();

  const {
    can,
    loading: permissionLoading,
  } = usePermissions();

  const [profile, setProfile] =
    useState<CompanyProfileSettings | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const allowed =
    can("settings.company.manage");

  useEffect(() => {
    if (permissionLoading) return;

    if (!allowed) {
      setLoading(false);
      return;
    }

    void loadProfile();
  }, [permissionLoading, allowed]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function loadProfile() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data =
        await getCompanyProfileSettings();

      setProfile(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Company Profile could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!profile) return;

    try {
      setSaving(true);
      setMessage("");
      setErrorMessage("");

      await saveCompanyProfileSettings(profile);

      await loadProfile();

      setMessage(
        "Company Profile saved successfully."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Company Profile could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  if (permissionLoading || loading) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-6xl p-6 lg:p-8">
          Loading Company Profile...
        </main>
      </DashboardLayout>
    );
  }

  if (!allowed) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-6xl p-6 lg:p-8">
          <h1 className="text-2xl font-bold">
            Restricted
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            You do not have permission to manage
            the Company Profile.
          </p>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={logout}
      />

      <main className="mx-auto max-w-6xl p-6 lg:p-8">
        <button
          type="button"
          onClick={() =>
            router.push("/settings")
          }
          className="mb-5 text-sm text-muted-foreground"
        >
          ← Settings
        </button>

        <h1 className="text-3xl font-bold">
          Company Profile
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This is the company's operational and legal
          identity. Branding and document appearance
          are configured separately.
        </p>

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-xl border p-4 text-sm">
            {message}
          </div>
        )}

        {profile && (
          <div className="mt-8 space-y-6">
            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">
                  Business Identity
                </h2>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Legal Company Name
                  </span>

                  <input
                    value={
                      profile.legal_name ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        legal_name:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Trading Name
                  </span>

                  <input
                    value={
                      profile.trading_name ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        trading_name:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Registration Number
                  </span>

                  <input
                    value={
                      profile.registration_number ??
                      ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        registration_number:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Business Type
                  </span>

                  <input
                    value={
                      profile.business_type ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        business_type:
                          event.target.value,
                      })
                    }
                    placeholder="Private Company, Sole Proprietor..."
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Industry
                  </span>

                  <input
                    value={
                      profile.industry ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        industry:
                          event.target.value,
                      })
                    }
                    placeholder="Technology, Education, Retail..."
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">
                  Contact Information
                </h2>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Email
                  </span>

                  <input
                    type="email"
                    value={
                      profile.email ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        email:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Phone
                  </span>

                  <input
                    value={
                      profile.phone ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        phone:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">
                    Website
                  </span>

                  <input
                    value={
                      profile.website ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        website:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">
                  Location
                </h2>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">
                    Physical Address
                  </span>

                  <textarea
                    value={
                      profile.physical_address ??
                      ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        physical_address:
                          event.target.value,
                      })
                    }
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">
                    Postal Address
                  </span>

                  <textarea
                    value={
                      profile.postal_address ??
                      ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        postal_address:
                          event.target.value,
                      })
                    }
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    City
                  </span>

                  <input
                    value={
                      profile.city ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        city:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Province
                  </span>

                  <input
                    value={
                      profile.province ?? ""
                    }
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        province:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Country
                  </span>

                  <select
                    value={profile.country_code}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        country_code:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="ZA">
                      South Africa
                    </option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Timezone
                  </span>

                  <select
                    value={profile.timezone}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        timezone:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="Africa/Johannesburg">
                      South Africa
                    </option>
                  </select>
                </label>
              </div>
            </section>

            <button
              type="button"
              disabled={saving}
              onClick={saveProfile}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Save Company Profile"}
            </button>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
