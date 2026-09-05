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
import CompanyLogoUploader from "@/components/CompanyLogoUploader";

import {
  uploadDocumentLogo,
  removeDocumentLogo,
} from "@/lib/services/documentLogoService";

import {
  supabase,
} from "@/lib/supabase";

import {
  getCurrentCompanyId,
  getCompanyDocumentSettings,
  saveCompanyDocumentSettings,
  getDocumentLogoUrl,
  type CompanyDocumentSettings,
} from "@/lib/services/settingsService";

import {
  usePermissions,
} from "@/hooks/usePermissions";


type EditableSettings = Omit<
  CompanyDocumentSettings,
  | "company_id"
  | "updated_by"
  | "updated_at"
>;


export default function BrandingSettingsPage() {
  const router = useRouter();

  const {
    can,
    loading: permissionsLoading,
  } = usePermissions();

  const [
    settings,
    setSettings,
  ] = useState<EditableSettings | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    logoUrl,
    setLogoUrl,
  ] = useState<string | null>(null);

  const [
    uploadingLogo,
    setUploadingLogo,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");


  const canManage =
    can("settings.branding.manage");


  useEffect(() => {
    if (permissionsLoading) {
      return;
    }

    if (!canManage) {
      setLoading(false);
      return;
    }

    void loadSettings();
  }, [
    permissionsLoading,
    canManage,
  ]);


  async function logout() {
    await supabase.auth.signOut();

    router.replace("/login");
  }


  async function loadSettings() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data =
        await getCompanyDocumentSettings();

      const signedLogoUrl =
        await getDocumentLogoUrl(
          data.logo_path
        );

      setLogoUrl(
        signedLogoUrl
      );

      setSettings({
        logo_path:
          data.logo_path,

        document_display_name:
          data.document_display_name,

        show_registration_number:
          data.show_registration_number,

        show_vat_number:
          data.show_vat_number,

        show_company_address:
          data.show_company_address,

        show_company_phone:
          data.show_company_phone,

        show_company_email:
          data.show_company_email,

        show_company_website:
          data.show_company_website,

        document_footer:
          data.document_footer,

        invoice_footer:
          data.invoice_footer,

        quotation_footer:
          data.quotation_footer,

        default_invoice_template:
          data.default_invoice_template,

        default_quotation_template:
          data.default_quotation_template,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Branding settings could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }


  function update<K extends keyof EditableSettings>(
    key: K,
    value: EditableSettings[K]
  ) {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }


  async function handleLogoUpload(
    file: File
  ) {
    try {
      setUploadingLogo(true);
      setErrorMessage("");
      setMessage("");

      const companyId =
        await getCurrentCompanyId();

      await uploadDocumentLogo(
        companyId,
        file
      );

      await loadSettings();

      setMessage(
        "Company logo updated successfully."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Logo could not be uploaded."
      );
    } finally {
      setUploadingLogo(false);
    }
  }


  async function handleLogoRemove() {
    try {
      setUploadingLogo(true);
      setErrorMessage("");
      setMessage("");

      await removeDocumentLogo(
        settings?.logo_path ?? null
      );

      setLogoUrl(null);

      if (settings) {
        setSettings({
          ...settings,
          logo_path: null,
        });
      }

      setMessage(
        "Company logo removed."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Logo could not be removed."
      );
    } finally {
      setUploadingLogo(false);
    }
  }


  async function save() {
    if (!settings) {
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      setErrorMessage("");

      await saveCompanyDocumentSettings(
        settings
      );

      setMessage(
        "Branding & document settings saved."
      );

      await loadSettings();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Branding settings could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }


  if (
    permissionsLoading ||
    loading
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-6xl p-6 lg:p-8">
          Loading Branding & Documents...
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
        <SettingsBackButton />

        <p className="text-sm font-medium text-muted-foreground">
          Company
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Branding & Documents
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Control how your business appears on
          invoices, quotations and other customer
          documents.
        </p>


        {!canManage ? (
          <div className="mt-8 rounded-xl border p-6">
            <h2 className="font-semibold">
              Restricted
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              You do not have permission to change
              company branding.
            </p>
          </div>
        ) : settings ? (
          <div className="mt-8 space-y-6">

            {message && (
              <div className="rounded-xl border p-4 text-sm">
                {message}
              </div>
            )}

            {errorMessage && (
              <div className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">
                {errorMessage}
              </div>
            )}


            <section className="rounded-xl border bg-card p-6">
              <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Brand Identity
                  </p>

                  <h2 className="mt-2 text-xl font-semibold">
                    Company Branding
                  </h2>

                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                    Manage the identity customers see on invoices,
                    quotations and other company documents.
                  </p>

                  <div className="mt-6">
                    <label className="text-sm font-medium">
                      Document Display Name
                    </label>

                    <input
                      value={settings.document_display_name ?? ""}
                      onChange={(event) =>
                        update(
                          "document_display_name",
                          event.target.value
                        )
                      }
                      placeholder="JINLAB"
                      className="mt-2 w-full rounded-md border bg-background px-3 py-2.5"
                    />

                    <p className="mt-2 text-xs text-muted-foreground">
                      This is the business name customers will see
                      on generated documents.
                    </p>
                  </div>
                </div>

                <div>
                  <CompanyLogoUploader
                    logoUrl={logoUrl}
                    uploading={uploadingLogo}
                    onUpload={handleLogoUpload}
                    onRemove={handleLogoRemove}
                  />
                </div>
              </div>
            </section>


            <section className="rounded-xl border bg-card p-6">
              <h2 className="text-lg font-semibold">
                Information Shown on Documents
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Choose which company details appear
                on invoices and quotations.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  [
                    "show_registration_number",
                    "Registration Number",
                  ],
                  [
                    "show_vat_number",
                    "VAT Number",
                  ],
                  [
                    "show_company_address",
                    "Company Address",
                  ],
                  [
                    "show_company_phone",
                    "Phone Number",
                  ],
                  [
                    "show_company_email",
                    "Email Address",
                  ],
                  [
                    "show_company_website",
                    "Website",
                  ],
                ].map(
                  ([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-lg border p-4"
                    >
                      <input
                        type="checkbox"
                        checked={
                          Boolean(
                            settings[
                              key as keyof EditableSettings
                            ]
                          )
                        }
                        onChange={(event) =>
                          update(
                            key as keyof EditableSettings,
                            event.target
                              .checked as never
                          )
                        }
                      />

                      <span className="text-sm font-medium">
                        {label}
                      </span>
                    </label>
                  )
                )}
              </div>
            </section>


            <section className="rounded-xl border bg-card p-6">
              <h2 className="text-lg font-semibold">
                Document Templates
              </h2>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">
                    Default Invoice Template
                  </label>

                  <select
                    value={
                      settings.default_invoice_template
                    }
                    onChange={(event) =>
                      update(
                        "default_invoice_template",
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="jinlab-signature">
                      JINLAB Signature
                    </option>

                    <option value="executive">
                      Executive
                    </option>

                    <option value="minimal">
                      Minimal
                    </option>

                    <option value="retail">
                      Retail / POS
                    </option>

                    <option value="corporate">
                      Corporate
                    </option>
                  </select>
                </div>


                <div>
                  <label className="text-sm font-medium">
                    Default Quotation Template
                  </label>

                  <select
                    value={
                      settings.default_quotation_template
                    }
                    onChange={(event) =>
                      update(
                        "default_quotation_template",
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="jinlab-signature">
                      JINLAB Signature
                    </option>

                    <option value="executive">
                      Executive
                    </option>

                    <option value="minimal">
                      Minimal
                    </option>

                    <option value="corporate">
                      Corporate
                    </option>
                  </select>
                </div>
              </div>
            </section>


            <section className="rounded-xl border bg-card p-6">
              <h2 className="text-lg font-semibold">
                Document Footers
              </h2>

              <div className="mt-5 space-y-5">
                <div>
                  <label className="text-sm font-medium">
                    Global Document Footer
                  </label>

                  <textarea
                    rows={3}
                    value={
                      settings.document_footer ??
                      ""
                    }
                    onChange={(event) =>
                      update(
                        "document_footer",
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Invoice Footer
                  </label>

                  <textarea
                    rows={3}
                    value={
                      settings.invoice_footer ??
                      ""
                    }
                    onChange={(event) =>
                      update(
                        "invoice_footer",
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Quotation Footer
                  </label>

                  <textarea
                    rows={3}
                    value={
                      settings.quotation_footer ??
                      ""
                    }
                    onChange={(event) =>
                      update(
                        "quotation_footer",
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2"
                  />
                </div>
              </div>
            </section>


            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black/85 disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : "Save Branding Settings"}
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
