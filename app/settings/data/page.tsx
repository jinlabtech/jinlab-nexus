"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import SettingsBackButton from "@/components/settings/SettingsBackButton";

import {
  supabase,
} from "@/lib/supabase";

import {
  createPortableCompanyBackup,
  getExportJobs,
  type CompanyExportJob,
  type ExportType,
} from "@/lib/services/dataExportService";

import {
  usePermissions,
} from "@/hooks/usePermissions";


function formatBytes(
  bytes: number | null
) {
  if (
    bytes === null ||
    bytes === undefined
  ) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(1)} MB`;
}


function statusStyle(
  status: string
) {
  switch (status) {
    case "completed":
      return "border-green-500/30 bg-green-500/10";

    case "failed":
      return "border-destructive/30 bg-destructive/10";

    case "processing":
      return "border-blue-500/30 bg-blue-500/10";

    default:
      return "border-border bg-muted/20";
  }
}


export default function DataPortabilityPage() {
  const router =
    useRouter();

  const {
    can,
    loading:
      permissionsLoading,
  } = usePermissions();


  const [jobs, setJobs] =
    useState<
      CompanyExportJob[]
    >([]);


  const [loadingJobs, setLoadingJobs] =
    useState(true);


  const [
    activeExport,
    setActiveExport,
  ] =
    useState<
      ExportType | null
    >(null);


  const [
    message,
    setMessage,
  ] =
    useState("");


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  const canExport =
    can("data.export");


  const canBackup =
    can("data.backup");


  useEffect(() => {
    if (
      permissionsLoading
    ) {
      return;
    }

    if (
      !canExport &&
      !canBackup
    ) {
      setLoadingJobs(false);
      return;
    }

    void loadJobs();
  }, [
    permissionsLoading,
    canExport,
    canBackup,
  ]);


  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }


  async function loadJobs() {
    try {
      setLoadingJobs(true);

      const data =
        await getExportJobs();

      setJobs(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Export history could not be loaded."
      );
    } finally {
      setLoadingJobs(false);
    }
  }


  async function runExport(
    exportType: ExportType
  ) {
    try {
      setActiveExport(
        exportType
      );

      setMessage("");
      setErrorMessage("");


      const result =
        await createPortableCompanyBackup(
          exportType
        );


      setMessage(
        `${result.filename} created successfully. ${formatBytes(
          result.size
        )}`
      );


      await loadJobs();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Backup could not be created."
      );

      await loadJobs();
    } finally {
      setActiveExport(null);
    }
  }


  if (
    permissionsLoading
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-6xl p-6 lg:p-8">
          Loading Data & Portability...
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

      <main className="mx-auto max-w-7xl p-6 lg:p-8">
        <SettingsBackButton />

        <p className="text-sm font-medium text-muted-foreground">
          Data Ownership
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Data & Portability
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Export your company's business information
          for offline storage, reporting, migration or
          use with another management system.
          JINLAB Nexus is designed to avoid unnecessary
          vendor lock-in.
        </p>


        {message && (
          <div className="mt-6 rounded-xl border p-4 text-sm">
            {message}
          </div>
        )}


        {errorMessage && (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}


        {!canExport &&
        !canBackup ? (
          <div className="mt-8 rounded-xl border p-6">
            <h2 className="font-semibold">
              Restricted
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have permission
              to export or back up company data.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <section className="rounded-xl border bg-card p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Everyday portability
                </p>

                <h2 className="mt-2 text-lg font-semibold">
                  Business Data Export
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Customers, suppliers, inventory,
                  quotations, sales orders, invoices,
                  payments and purchasing records.
                </p>

                <div className="mt-5 flex gap-2">
                  <span className="rounded-full border px-3 py-1 text-xs">
                    CSV
                  </span>

                  <span className="rounded-full border px-3 py-1 text-xs">
                    JSON
                  </span>

                  <span className="rounded-full border px-3 py-1 text-xs">
                    ZIP
                  </span>
                </div>

                <button
                  type="button"
                  disabled={
                    !canExport ||
                    activeExport !== null
                  }
                  onClick={() =>
                    runExport(
                      "business_data"
                    )
                  }
                  className="mt-6 w-full rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activeExport ===
                  "business_data"
                    ? "Creating Export..."
                    : "Export Business Data"}
                </button>
              </section>


              <section className="rounded-xl border bg-card p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Owner backup
                </p>

                <h2 className="mt-2 text-lg font-semibold">
                  Full Company Backup
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Includes business records plus
                  company configuration, finance,
                  accounting and governance data.
                </p>

                <div className="mt-5 flex gap-2">
                  <span className="rounded-full border px-3 py-1 text-xs">
                    JSON
                  </span>

                  <span className="rounded-full border px-3 py-1 text-xs">
                    CSV
                  </span>

                  <span className="rounded-full border px-3 py-1 text-xs">
                    Manifest
                  </span>
                </div>

                <button
                  type="button"
                  disabled={
                    !canBackup ||
                    activeExport !== null
                  }
                  onClick={() =>
                    runExport(
                      "full_backup"
                    )
                  }
                  className="mt-6 w-full rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activeExport ===
                  "full_backup"
                    ? "Creating Backup..."
                    : "Download Full Backup"}
                </button>

                {!canBackup && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Owner-level permission required.
                  </p>
                )}
              </section>


              <section className="rounded-xl border bg-card p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Technical migration
                </p>

                <h2 className="mt-2 text-lg font-semibold">
                  Migration Package
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Structured portable data intended
                  for migration into another ERP,
                  database or management system.
                </p>

                <div className="mt-5 flex gap-2">
                  <span className="rounded-full border px-3 py-1 text-xs">
                    CSV
                  </span>

                  <span className="rounded-full border px-3 py-1 text-xs">
                    JSON
                  </span>

                  <span className="rounded-full border px-3 py-1 text-xs">
                    Schema Info
                  </span>
                </div>

                <button
                  type="button"
                  disabled={
                    !canBackup ||
                    activeExport !== null
                  }
                  onClick={() =>
                    runExport(
                      "migration_package"
                    )
                  }
                  className="mt-6 w-full rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activeExport ===
                  "migration_package"
                    ? "Preparing Package..."
                    : "Create Migration Package"}
                </button>
              </section>
            </div>


            <section className="mt-8 rounded-xl border bg-card">
              <div className="border-b p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">
                      Export History
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Backup and export activity is
                      recorded for accountability.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadJobs}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    Refresh
                  </button>
                </div>
              </div>


              {loadingJobs ? (
                <p className="p-5 text-sm text-muted-foreground">
                  Loading export history...
                </p>
              ) : jobs.length ===
                0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No company exports have been
                  created yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          Requested
                        </th>

                        <th className="px-4 py-3 text-left">
                          Type
                        </th>

                        <th className="px-4 py-3 text-left">
                          Status
                        </th>

                        <th className="px-4 py-3 text-left">
                          Size
                        </th>

                        <th className="px-4 py-3 text-left">
                          Checksum
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {jobs.map(
                        (job) => (
                          <tr
                            key={job.id}
                            className="border-t"
                          >
                            <td className="px-4 py-3">
                              {new Date(
                                job.requested_at
                              ).toLocaleString()}
                            </td>

                            <td className="px-4 py-3">
                              {job.export_type
                                .replace(
                                  /_/g,
                                  " "
                                )}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-xs ${statusStyle(
                                  job.status
                                )}`}
                              >
                                {job.status}
                              </span>

                              {job.error_message && (
                                <p className="mt-2 max-w-xs text-xs text-destructive">
                                  {
                                    job.error_message
                                  }
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {formatBytes(
                                job.file_size_bytes
                              )}
                            </td>

                            <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs">
                              {job.checksum_sha256 ??
                                "—"}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>


            <section className="mt-8 rounded-xl border bg-muted/20 p-5">
              <h2 className="font-semibold">
                Portability Standard
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                Nexus exports are designed to be
                understandable outside JINLAB Nexus.
                CSV supports spreadsheets and many
                basic management systems. JSON
                preserves structured data for
                developers and migrations. Technical
                database-specific migration formats
                will remain separate because
                PostgreSQL and MySQL/cPanel
                environments are not directly
                interchangeable.
              </p>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
