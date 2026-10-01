"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderLock,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type Employee = {
  id: string;
  employee_number: string;
  name: string;
  status: string;
};


type HrDocument = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;

  document_type: string;
  title: string;

  file_path: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;

  issued_date: string | null;
  expiry_date: string | null;

  status: string;
  notes: string | null;

  uploaded_at: string | null;
  created_at: string;
};


type DocumentWorkspace = {
  ok: boolean;
  company_id: string;

  employees: Employee[];

  documents: HrDocument[];

  summary: {
    total: number;
    current: number;
    expiring_30_days: number;
  };
};


const inputClass =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-foreground";

const textareaClass =
  "min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";


const allowedMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];


function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-background">

      <div className="border-b px-5 py-4">

        <h2 className="font-semibold">
          {title}
        </h2>

        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}

      </div>

      <div className="p-5">
        {children}
      </div>

    </section>
  );
}


function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">

      <span className="font-medium">
        {label}
      </span>

      {children}

    </label>
  );
}


function Badge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
      {
        value.replaceAll(
          "_",
          " "
        )
      }
    </span>
  );
}


function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5">

      <div className="text-muted-foreground">
        {icon}
      </div>

      <p className="mt-3 text-3xl font-bold">
        {value}
      </p>

      <p className="text-sm text-muted-foreground">
        {title}
      </p>

    </div>
  );
}


function formatBytes(
  value:
    number | null
) {
  if (
    value ===
      null ||
    Number.isNaN(
      value
    )
  ) {
    return "—";
  }


  if (
    value <
    1024
  ) {
    return `${value} B`;
  }


  if (
    value <
    1024 *
      1024
  ) {
    return `${(
      value /
      1024
    ).toFixed(
      1
    )} KB`;
  }


  return `${(
    value /
    1024 /
    1024
  ).toFixed(
    1
  )} MB`;
}


function humanDate(
  value:
    string | null
) {
  if (!value) {
    return "—";
  }


  const raw =
    value.slice(
      0,
      10
    );


  const date =
    new Date(
      `${raw}T12:00:00`
    );


  return date.toLocaleDateString(
    "en-ZA",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}


function safeFileName(
  name:
    string
) {
  const cleaned =
    name
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )
      .replace(
        /_+/g,
        "_"
      );


  return (
    cleaned.slice(
      -120
    ) ||
    "document"
  );
}


function resolveMimeType(
  file:
    File
) {
  if (
    allowedMimeTypes.includes(
      file.type
    )
  ) {
    return file.type;
  }


  const extension =
    file.name
      .split(
        "."
      )
      .pop()
      ?.toLowerCase();


  const map:
    Record<
      string,
      string
    > = {
      pdf:
        "application/pdf",

      png:
        "image/png",

      jpg:
        "image/jpeg",

      jpeg:
        "image/jpeg",

      webp:
        "image/webp",

      doc:
        "application/msword",

      docx:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };


  return extension
    ? map[
        extension
      ] ??
        ""
    : "";
}


export default function HrDocumentsPage() {
  const router =
    useRouter();


  const [
    workspace,
    setWorkspace,
  ] =
    useState<DocumentWorkspace | null>(
      null
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    busy,
    setBusy,
  ] =
    useState(
      ""
    );


  const [
    error,
    setError,
  ] =
    useState(
      ""
    );


  const [
    success,
    setSuccess,
  ] =
    useState(
      ""
    );


  const [
    selectedEmployeeId,
    setSelectedEmployeeId,
  ] =
    useState(
      ""
    );


  const [
    selectedFile,
    setSelectedFile,
  ] =
    useState<File | null>(
      null
    );


  const [
    fileInputKey,
    setFileInputKey,
  ] =
    useState(
      0
    );


  const [
    form,
    setForm,
  ] =
    useState({
      document_type:
        "contract",

      title:
        "",

      issued_date:
        "",

      expiry_date:
        "",

      notes:
        "",
    });


  async function load(
    employeeId:
      string =
        selectedEmployeeId
  ) {
    setError(
      ""
    );


    const {
      data: {
        user,
      },
    } =
      await supabase.auth.getUser();


    if (!user) {
      router.push(
        "/login"
      );

      return;
    }


    const {
      data,
      error:
        rpcError,
    } =
      await supabase.rpc(
        "get_hr_documents_workspace",
        {
          p_employee_id:
            employeeId ||
            null,
        }
      );


    if (rpcError) {
      throw rpcError;
    }


    setWorkspace(
      data as DocumentWorkspace
    );
  }


  useEffect(
    () => {
      async function start() {
        try {
          await load(
            ""
          );

        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load secure HR documents."
          );

        } finally {
          setLoading(
            false
          );
        }
      }


      void start();
    },
    []
  );


  useEffect(
    () => {
      if (
        !loading &&
        workspace
      ) {
        void load(
          selectedEmployeeId
        );
      }
    },
    [
      selectedEmployeeId,
    ]
  );


  const selectedEmployee =
    useMemo(
      () =>
        workspace?.employees.find(
          (
            employee
          ) =>
            employee.id ===
            selectedEmployeeId
        ) ??
        null,
      [
        workspace,
        selectedEmployeeId,
      ]
    );


  async function uploadDocument() {
    if (
      !workspace
    ) {
      return;
    }


    if (
      !selectedEmployeeId
    ) {
      setError(
        "Choose an employee first."
      );

      return;
    }


    if (
      !selectedFile
    ) {
      setError(
        "Choose a document to upload."
      );

      return;
    }


    if (
      selectedFile.size >
      15 *
        1024 *
        1024
    ) {
      setError(
        "The document is larger than 15 MB."
      );

      return;
    }


    const mimeType =
      resolveMimeType(
        selectedFile
      );


    if (
      !allowedMimeTypes.includes(
        mimeType
      )
    ) {
      setError(
        "Unsupported file type. Use PDF, JPG, PNG, WebP, DOC or DOCX."
      );

      return;
    }


    const title =
      form.title.trim() ||
      selectedFile.name.replace(
        /\.[^.]+$/,
        ""
      );


    setBusy(
      "upload"
    );

    setError(
      ""
    );

    setSuccess(
      ""
    );


    let uploadedPath:
      string | null =
        null;


    try {
      const path =
        [
          workspace.company_id,
          selectedEmployeeId,
          `${crypto.randomUUID()}-${safeFileName(
            selectedFile.name
          )}`,
        ].join(
          "/"
        );


      const {
        error:
          uploadError,
      } =
        await supabase.storage
          .from(
            "hr-documents"
          )
          .upload(
            path,
            selectedFile,
            {
              cacheControl:
                "3600",

              upsert:
                false,

              contentType:
                mimeType,
            }
          );


      if (uploadError) {
        throw uploadError;
      }


      uploadedPath =
        path;


      const {
        error:
          registerError,
      } =
        await supabase.rpc(
          "register_hr_document_file",
          {
            p_employee_id:
              selectedEmployeeId,

            p_document_type:
              form.document_type,

            p_title:
              title,

            p_file_path:
              path,

            p_original_file_name:
              selectedFile.name,

            p_mime_type:
              mimeType,

            p_file_size_bytes:
              selectedFile.size,

            p_issued_date:
              form.issued_date ||
              null,

            p_expiry_date:
              form.expiry_date ||
              null,

            p_notes:
              form.notes ||
              null,
          }
        );


      if (registerError) {
        /*
         * Registration failed after upload.
         * Remove the orphaned file immediately.
         */
        await supabase.storage
          .from(
            "hr-documents"
          )
          .remove([
            path,
          ]);


        uploadedPath =
          null;


        throw registerError;
      }


      setSuccess(
        `${selectedFile.name} uploaded securely for ${
          selectedEmployee?.name ??
          "employee"
        }.`
      );


      setSelectedFile(
        null
      );


      setFileInputKey(
        (
          value
        ) =>
          value +
          1
      );


      setForm({
        document_type:
          "contract",

        title:
          "",

        issued_date:
          "",

        expiry_date:
          "",

        notes:
          "",
      });


      await load(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      /*
       * Last-resort orphan cleanup.
       */
      if (
        uploadedPath
      ) {
        await supabase.storage
          .from(
            "hr-documents"
          )
          .remove([
            uploadedPath,
          ]);
      }


      setError(
        caught instanceof Error
          ? caught.message
          : "Secure document upload failed."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function openDocument(
    document:
      HrDocument
  ) {
    if (
      !document.file_path
    ) {
      setError(
        "This HR record does not have a stored file."
      );

      return;
    }


    setBusy(
      `open-${document.id}`
    );

    setError(
      ""
    );


    try {
      const {
        data,
        error:
          signedError,
      } =
        await supabase.storage
          .from(
            "hr-documents"
          )
          .createSignedUrl(
            document.file_path,
            300
          );


      if (signedError) {
        throw signedError;
      }


      if (
        !data?.signedUrl
      ) {
        throw new Error(
          "Secure download URL could not be created."
        );
      }


      window.open(
        data.signedUrl,
        "_blank",
        "noopener,noreferrer"
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to open HR document."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function archiveDocument(
    document:
      HrDocument
  ) {
    const confirmed =
      window.confirm(
        `Archive "${document.title}"? The secure file will remain stored, but the HR record will be marked archived.`
      );


    if (!confirmed) {
      return;
    }


    setBusy(
      `archive-${document.id}`
    );

    setError(
      ""
    );

    setSuccess(
      ""
    );


    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "archive_hr_document_record",
          {
            p_record_id:
              document.id,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        "HR document archived."
      );


      await load(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to archive document."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  if (loading) {
    return (
      <DashboardLayout>

        <div className="flex min-h-screen items-center justify-center">

          <p className="text-sm text-muted-foreground">
            Opening secure HR document vault...
          </p>

        </div>

      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nexus HR
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              Secure Employee Documents
            </h1>

            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Private employee contracts, certificates, medical notes, warnings and other controlled HR files.
            </p>

          </div>


          <button
            type="button"
            onClick={
              () =>
                void load()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

        </div>


        {error ? (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">

            <XCircle className="h-5 w-5 shrink-0" />

            {error}

          </div>
        ) : null}


        {success ? (
          <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">

            <CheckCircle2 className="h-5 w-5 shrink-0" />

            {success}

          </div>
        ) : null}


        {workspace ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Secure documents"
                value={
                  workspace.summary.total
                }
                icon={
                  <FolderLock className="h-5 w-5" />
                }
              />


              <Stat
                title="Current"
                value={
                  workspace.summary.current
                }
                icon={
                  <ShieldCheck className="h-5 w-5" />
                }
              />


              <Stat
                title="Expiring in 30 days"
                value={
                  workspace.summary.expiring_30_days
                }
                icon={
                  <FileText className="h-5 w-5" />
                }
              />


              <Stat
                title="Employees"
                value={
                  workspace.employees.length
                }
                icon={
                  <Users className="h-5 w-5" />
                }
              />

            </div>


            {workspace.employees.length ===
            0 ? (
              <Panel
                title="No HR employees"
                description="Documents belong to HR employee identities."
              >

                <p className="text-sm text-muted-foreground">
                  Create and link your HR employee records before uploading employee documents.
                </p>

              </Panel>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[430px_1fr]">

                <Panel
                  title="Upload Document"
                  description="Files are stored privately and are not publicly accessible."
                >

                  <div className="grid gap-4">

                    <Field label="Employee">

                      <SearchableSelect searchLabel="Employees"
                        value={
                          selectedEmployeeId
                        }
                        onValueChange={
                          (
                            selectedValue
                          ) =>
                            setSelectedEmployeeId(
                              selectedValue
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          Choose employee
                        </option>

                        {workspace.employees.map(
                          (
                            employee
                          ) => (
                            <option
                              key={
                                employee.id
                              }
                              value={
                                employee.id
                              }
                            >
                              {employee.employee_number} · {employee.name}
                            </option>
                          )
                        )}

                      </SearchableSelect>

                    </Field>


                    <Field label="Document type">

                      <select
                        value={
                          form.document_type
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setForm({
                              ...form,

                              document_type:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >

                        <option value="contract">
                          Contract
                        </option>

                        <option value="id_document">
                          ID Document
                        </option>

                        <option value="certificate">
                          Certificate
                        </option>

                        <option value="medical_note">
                          Medical Note
                        </option>

                        <option value="warning">
                          Warning
                        </option>

                        <option value="performance">
                          Performance Record
                        </option>

                        <option value="policy_acknowledgement">
                          Policy Acknowledgement
                        </option>

                        <option value="other">
                          Other
                        </option>

                      </select>

                    </Field>


                    <Field label="Title">

                      <input
                        value={
                          form.title
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setForm({
                              ...form,

                              title:
                                event.target.value,
                            })
                        }
                        placeholder="Example: Employment Contract"
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <Field label="File">

                      <input
                        key={
                          fileInputKey
                        }
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                        onChange={
                          (
                            event
                          ) =>
                            setSelectedFile(
                              event.target.files?.[
                                0
                              ] ??
                              null
                            )
                        }
                        className="block w-full rounded-xl border bg-background p-3 text-sm"
                      />

                    </Field>


                    {selectedFile ? (
                      <div className="rounded-xl bg-muted/40 p-3 text-sm">

                        <p className="font-semibold">
                          {selectedFile.name}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatBytes(
                            selectedFile.size
                          )}
                        </p>

                      </div>
                    ) : null}


                    <div className="grid grid-cols-2 gap-3">

                      <Field label="Issued date">

                        <input
                          type="date"
                          value={
                            form.issued_date
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setForm({
                                ...form,

                                issued_date:
                                  event.target.value,
                              })
                          }
                          className={
                            inputClass
                          }
                        />

                      </Field>


                      <Field label="Expiry date">

                        <input
                          type="date"
                          value={
                            form.expiry_date
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setForm({
                                ...form,

                                expiry_date:
                                  event.target.value,
                              })
                          }
                          className={
                            inputClass
                          }
                        />

                      </Field>

                    </div>


                    <Field label="Notes">

                      <textarea
                        value={
                          form.notes
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setForm({
                              ...form,

                              notes:
                                event.target.value,
                            })
                        }
                        className={
                          textareaClass
                        }
                      />

                    </Field>


                    <button
                      type="button"
                      disabled={
                        busy ===
                          "upload" ||
                        !selectedEmployeeId ||
                        !selectedFile
                      }
                      onClick={
                        () =>
                          void uploadDocument()
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-50"
                    >

                      <Upload className="h-4 w-4" />

                      {busy ===
                      "upload"
                        ? "Uploading securely..."
                        : "Upload Secure Document"}

                    </button>


                    <div className="rounded-xl border p-3 text-xs text-muted-foreground">
                      Maximum 15 MB. Supported: PDF, JPG, PNG, WebP, DOC and DOCX.
                    </div>

                  </div>

                </Panel>


                <Panel
                  title={
                    selectedEmployee
                      ? `${selectedEmployee.name} — Documents`
                      : "Employee Document Vault"
                  }
                  description="Files open through short-lived signed links."
                >

                  {workspace.documents.length ===
                  0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">

                      <FolderLock className="mx-auto h-8 w-8 text-muted-foreground" />

                      <p className="mt-3 font-semibold">
                        No secure HR documents
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Upload the first employee file using the form.
                      </p>

                    </div>
                  ) : (
                    <div className="space-y-3">

                      {workspace.documents.map(
                        (
                          document
                        ) => (
                          <div
                            key={
                              document.id
                            }
                            className="rounded-2xl border p-4"
                          >

                            <div className="flex flex-wrap items-start justify-between gap-3">

                              <div className="min-w-0">

                                <div className="flex items-center gap-2">

                                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />

                                  <p className="truncate font-bold">
                                    {document.title}
                                  </p>

                                </div>


                                <p className="mt-1 text-xs text-muted-foreground">
                                  {document.employee_number}
                                  {" · "}
                                  {document.employee_name}
                                </p>

                              </div>


                              <Badge
                                value={
                                  document.status
                                }
                              />

                            </div>


                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

                              <div className="rounded-xl bg-muted/40 p-3">

                                <p className="text-xs text-muted-foreground">
                                  Type
                                </p>

                                <p className="mt-1 text-sm font-semibold capitalize">
                                  {
                                    document.document_type.replaceAll(
                                      "_",
                                      " "
                                    )
                                  }
                                </p>

                              </div>


                              <div className="rounded-xl bg-muted/40 p-3">

                                <p className="text-xs text-muted-foreground">
                                  File
                                </p>

                                <p className="mt-1 truncate text-sm font-semibold">
                                  {document.original_file_name ??
                                    "Stored file"}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                  {formatBytes(
                                    document.file_size_bytes
                                  )}
                                </p>

                              </div>


                              <div className="rounded-xl bg-muted/40 p-3">

                                <p className="text-xs text-muted-foreground">
                                  Issued
                                </p>

                                <p className="mt-1 text-sm font-semibold">
                                  {humanDate(
                                    document.issued_date
                                  )}
                                </p>

                              </div>


                              <div className="rounded-xl bg-muted/40 p-3">

                                <p className="text-xs text-muted-foreground">
                                  Expiry
                                </p>

                                <p className="mt-1 text-sm font-semibold">
                                  {humanDate(
                                    document.expiry_date
                                  )}
                                </p>

                              </div>

                            </div>


                            {document.notes ? (
                              <p className="mt-3 text-sm text-muted-foreground">
                                {document.notes}
                              </p>
                            ) : null}


                            <div className="mt-4 flex flex-wrap gap-2">

                              {document.file_path ? (
                                <button
                                  type="button"
                                  disabled={
                                    busy ===
                                    `open-${document.id}`
                                  }
                                  onClick={
                                    () =>
                                      void openDocument(
                                        document
                                      )
                                  }
                                  className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open Secure File
                                </button>
                              ) : null}


                              {document.status !==
                              "archived" ? (
                                <button
                                  type="button"
                                  disabled={
                                    busy ===
                                    `archive-${document.id}`
                                  }
                                  onClick={
                                    () =>
                                      void archiveDocument(
                                        document
                                      )
                                  }
                                  className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
                                >
                                  <Archive className="h-4 w-4" />
                                  Archive
                                </button>
                              ) : null}

                            </div>

                          </div>
                        )
                      )}

                    </div>
                  )}

                </Panel>

              </div>
            )}
          </>
        ) : null}

      </main>

    </DashboardLayout>
  );
}
