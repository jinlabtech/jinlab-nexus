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
  Activity,
  CheckCircle2,
  FileText,
  RefreshCw,
  Save,
  ShieldAlert,
  Star,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type EmployeeOption = {
  id: string;
  employee_number: string;
  full_name: string;
  status: string;
  position_title: string | null;
  branch_name: string | null;
};


type PerformanceReview = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  period_start: string;
  period_end: string;
  rating: number | null;
  status: string;
  summary: string | null;
  strengths: string | null;
  improvement_areas: string | null;
  goals: string | null;
  employee_comments: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};


type DisciplinaryCase = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  case_type: string;
  incident_date: string;
  status: string;
  summary: string;
  details: string | null;
  action_taken: string | null;
  issued_at: string | null;
  expiry_date: string | null;
  employee_comments: string | null;
  created_at: string;
  updated_at: string;
};


type HrDocument = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  document_type: string;
  title: string;
  file_path: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};


type RecordsWorkspace = {
  ok: boolean;

  mode:
    | "management"
    | "self";

  own_employee_id:
    string | null;

  selected_employee_id:
    string | null;

  capabilities: {
    performance_manage: boolean;
    discipline_manage: boolean;
    documents_manage: boolean;
    performance_acknowledge: boolean;
  };

  employees:
    EmployeeOption[];

  performance_reviews:
    PerformanceReview[];

  disciplinary_cases:
    DisciplinaryCase[];

  documents:
    HrDocument[];

  summary: {
    performance_total: number;
    discipline_open: number;
    documents_current: number;
    documents_expiring_30_days: number;
  };
};


const inputClass =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-foreground";

const textareaClass =
  "min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";


function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10
    );
}


function yearStart() {
  return `${new Date().getFullYear()}-01-01`;
}


function humanDate(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  const parsed =
    new Date(
      `${value.slice(0, 10)}T12:00:00`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return value;
  }

  return parsed.toLocaleDateString(
    "en-ZA",
    {
      day:
        "numeric",
      month:
        "short",
      year:
        "numeric",
    }
  );
}


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


function Button({
  children,
  onClick,
  disabled = false,
  primary = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "bg-foreground text-background"
          : "border bg-background",
      ].join(
        " "
      )}
    >
      {children}
    </button>
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


export default function HrRecordsPage() {
  const router =
    useRouter();

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
    data,
    setData,
  ] =
    useState<RecordsWorkspace | null>(
      null
    );

  const [
    selectedEmployeeId,
    setSelectedEmployeeId,
  ] =
    useState(
      ""
    );

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<
      | "performance"
      | "discipline"
      | "documents"
    >(
      "performance"
    );


  const [
    performanceForm,
    setPerformanceForm,
  ] =
    useState({
      id: "",
      employee_id: "",
      period_start:
        yearStart(),
      period_end:
        today(),
      rating:
        "3",
      summary:
        "",
      strengths:
        "",
      improvement_areas:
        "",
      goals:
        "",
      status:
        "draft",
    });


  const [
    acknowledgeComments,
    setAcknowledgeComments,
  ] =
    useState<Record<
      string,
      string
    >>(
      {}
    );


  const [
    disciplineForm,
    setDisciplineForm,
  ] =
    useState({
      id: "",
      employee_id: "",
      case_type:
        "written_warning",
      incident_date:
        today(),
      summary:
        "",
      details:
        "",
      action_taken:
        "",
      status:
        "open",
      expiry_date:
        "",
    });


  const [
    documentForm,
    setDocumentForm,
  ] =
    useState({
      id: "",
      employee_id: "",
      document_type:
        "contract",
      title:
        "",
      file_path:
        "",
      issued_date:
        today(),
      expiry_date:
        "",
      status:
        "current",
      notes:
        "",
    });


  async function load(
    employeeId?:
      string
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
      data:
        result,
      error:
        rpcError,
    } =
      await supabase.rpc(
        "get_hr_records_workspace",
        {
          p_employee_id:
            employeeId ||
            null,
        }
      );


    if (rpcError) {
      throw rpcError;
    }


    const workspace =
      result as RecordsWorkspace;


    setData(
      workspace
    );


    if (
      workspace.mode ===
        "management" &&
      !selectedEmployeeId &&
      workspace.employees.length >
        0
    ) {
      setSelectedEmployeeId(
        workspace.employees[0].id
      );
    }
  }


  useEffect(
    () => {
      async function start() {
        try {
          await load();

        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load HR records."
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
        selectedEmployeeId
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


  const mode =
    data?.mode ??
    "self";


  const selectedEmployee =
    useMemo(
      () =>
        data?.employees.find(
          (
            employee
          ) =>
            employee.id ===
            selectedEmployeeId
        ) ??
        null,
      [
        data,
        selectedEmployeeId,
      ]
    );


  function resetPerformance() {
    setPerformanceForm({
      id:
        "",
      employee_id:
        selectedEmployeeId,
      period_start:
        yearStart(),
      period_end:
        today(),
      rating:
        "3",
      summary:
        "",
      strengths:
        "",
      improvement_areas:
        "",
      goals:
        "",
      status:
        "draft",
    });
  }


  async function savePerformance() {
    if (
      !data?.capabilities.performance_manage
    ) {
      return;
    }


    const employeeId =
      performanceForm.employee_id ||
      selectedEmployeeId;


    if (
      !employeeId
    ) {
      setError(
        "Choose an employee."
      );

      return;
    }


    setBusy(
      "performance-save"
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
          "save_hr_performance_review",
          {
            p_id:
              performanceForm.id ||
              null,

            p_employee_id:
              employeeId,

            p_period_start:
              performanceForm.period_start,

            p_period_end:
              performanceForm.period_end,

            p_rating:
              performanceForm.rating
                ? Number(
                    performanceForm.rating
                  )
                : null,

            p_summary:
              performanceForm.summary ||
              null,

            p_strengths:
              performanceForm.strengths ||
              null,

            p_improvement_areas:
              performanceForm.improvement_areas ||
              null,

            p_goals:
              performanceForm.goals ||
              null,

            p_status:
              performanceForm.status,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        performanceForm.id
          ? "Performance review updated."
          : "Performance review created."
      );


      resetPerformance();

      await load(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save performance review."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function acknowledgePerformance(
    reviewId:
      string
  ) {
    setBusy(
      `ack-${reviewId}`
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
          "acknowledge_hr_performance_review",
          {
            p_review_id:
              reviewId,

            p_comments:
              acknowledgeComments[
                reviewId
              ] ||
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        "Performance review acknowledged."
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
          : "Unable to acknowledge review."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function editPerformance(
    review:
      PerformanceReview
  ) {
    setPerformanceForm({
      id:
        review.id,

      employee_id:
        review.employee_id,

      period_start:
        review.period_start,

      period_end:
        review.period_end,

      rating:
        review.rating !==
        null
          ? String(
              review.rating
            )
          : "",

      summary:
        review.summary ??
        "",

      strengths:
        review.strengths ??
        "",

      improvement_areas:
        review.improvement_areas ??
        "",

      goals:
        review.goals ??
        "",

      status:
        review.status,
    });


    window.scrollTo({
      top:
        0,
      behavior:
        "smooth",
    });
  }


  function resetDiscipline() {
    setDisciplineForm({
      id:
        "",
      employee_id:
        selectedEmployeeId,
      case_type:
        "written_warning",
      incident_date:
        today(),
      summary:
        "",
      details:
        "",
      action_taken:
        "",
      status:
        "open",
      expiry_date:
        "",
    });
  }


  async function saveDiscipline() {
    if (
      !data?.capabilities.discipline_manage
    ) {
      return;
    }


    const employeeId =
      disciplineForm.employee_id ||
      selectedEmployeeId;


    if (
      !employeeId ||
      !disciplineForm.summary
    ) {
      setError(
        "Employee and case summary are required."
      );

      return;
    }


    setBusy(
      "discipline-save"
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
          "save_hr_disciplinary_case",
          {
            p_id:
              disciplineForm.id ||
              null,

            p_employee_id:
              employeeId,

            p_case_type:
              disciplineForm.case_type,

            p_incident_date:
              disciplineForm.incident_date,

            p_summary:
              disciplineForm.summary,

            p_details:
              disciplineForm.details ||
              null,

            p_action_taken:
              disciplineForm.action_taken ||
              null,

            p_status:
              disciplineForm.status,

            p_expiry_date:
              disciplineForm.expiry_date ||
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        disciplineForm.id
          ? "Disciplinary record updated."
          : "Disciplinary record created."
      );


      resetDiscipline();

      await load(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save disciplinary record."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function editDiscipline(
    item:
      DisciplinaryCase
  ) {
    setDisciplineForm({
      id:
        item.id,

      employee_id:
        item.employee_id,

      case_type:
        item.case_type,

      incident_date:
        item.incident_date,

      summary:
        item.summary,

      details:
        item.details ??
        "",

      action_taken:
        item.action_taken ??
        "",

      status:
        item.status,

      expiry_date:
        item.expiry_date ??
        "",
    });


    window.scrollTo({
      top:
        0,
      behavior:
        "smooth",
    });
  }


  function resetDocument() {
    setDocumentForm({
      id:
        "",
      employee_id:
        selectedEmployeeId,
      document_type:
        "contract",
      title:
        "",
      file_path:
        "",
      issued_date:
        today(),
      expiry_date:
        "",
      status:
        "current",
      notes:
        "",
    });
  }


  async function saveDocument() {
    if (
      !data?.capabilities.documents_manage
    ) {
      return;
    }


    const employeeId =
      documentForm.employee_id ||
      selectedEmployeeId;


    if (
      !employeeId ||
      !documentForm.title
    ) {
      setError(
        "Employee and document title are required."
      );

      return;
    }


    setBusy(
      "document-save"
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
          "save_hr_document_record",
          {
            p_id:
              documentForm.id ||
              null,

            p_employee_id:
              employeeId,

            p_document_type:
              documentForm.document_type,

            p_title:
              documentForm.title,

            p_file_path:
              documentForm.file_path ||
              null,

            p_issued_date:
              documentForm.issued_date ||
              null,

            p_expiry_date:
              documentForm.expiry_date ||
              null,

            p_status:
              documentForm.status,

            p_notes:
              documentForm.notes ||
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        documentForm.id
          ? "HR document record updated."
          : "HR document record created."
      );


      resetDocument();

      await load(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save HR document."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function editDocument(
    item:
      HrDocument
  ) {
    setDocumentForm({
      id:
        item.id,

      employee_id:
        item.employee_id,

      document_type:
        item.document_type,

      title:
        item.title,

      file_path:
        item.file_path ??
        "",

      issued_date:
        item.issued_date ??
        "",

      expiry_date:
        item.expiry_date ??
        "",

      status:
        item.status,

      notes:
        item.notes ??
        "",
    });


    window.scrollTo({
      top:
        0,
      behavior:
        "smooth",
    });
  }


  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Loading HR records...
          </p>
        </div>
      </DashboardLayout>
    );
  }


  if (!data) {
    return (
      <DashboardLayout>
        <main className="mx-auto max-w-xl p-6">
          <Panel title="HR Records">
            <p className="text-sm text-red-700">
              {error ||
                "Unable to open HR records."}
            </p>
          </Panel>
        </main>
      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nexus HR
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              Employee Files & History
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Performance, discipline and controlled HR document records.
            </p>
          </div>


          <Button
            onClick={
              () =>
                void load(
                  selectedEmployeeId
                )
            }
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>

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


        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-2xl border bg-background p-5">
            <Activity className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-3xl font-bold">
              {data.summary.performance_total}
            </p>

            <p className="text-sm text-muted-foreground">
              Performance reviews
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-5">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-3xl font-bold">
              {data.summary.discipline_open}
            </p>

            <p className="text-sm text-muted-foreground">
              Open disciplinary cases
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-5">
            <FileText className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-3xl font-bold">
              {data.summary.documents_current}
            </p>

            <p className="text-sm text-muted-foreground">
              Current HR documents
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-5">
            <FileText className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-3xl font-bold">
              {data.summary.documents_expiring_30_days}
            </p>

            <p className="text-sm text-muted-foreground">
              Expiring within 30 days
            </p>
          </div>

        </div>


        {mode ===
        "management" ? (
          <Panel
            title="Employee"
            description="Filter HR history to one employee."
          >

            {data.employees.length ===
            0 ? (
              <p className="text-sm text-muted-foreground">
                No HR employees exist yet.
              </p>
            ) : (
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
                  All employees
                </option>

                {data.employees.map(
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
                      {employee.employee_number} · {employee.full_name}
                    </option>
                  )
                )}
              </SearchableSelect>
            )}

          </Panel>
        ) : (
          <Panel
            title="My HR Records"
            description="Only your published performance history is visible in employee self-service."
          >
            <div className="flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-muted-foreground" />

              <p className="text-sm">
                Private disciplinary and management documents remain restricted.
              </p>
            </div>
          </Panel>
        )}


        <div className="overflow-x-auto rounded-2xl border bg-background px-3">
          <div className="flex min-w-max">

            <button
              type="button"
              onClick={
                () =>
                  setActiveTab(
                    "performance"
                  )
              }
              className={[
                "border-b-2 px-4 py-4 text-sm font-semibold",
                activeTab ===
                "performance"
                  ? "border-foreground"
                  : "border-transparent text-muted-foreground",
              ].join(
                " "
              )}
            >
              Performance
            </button>


            {data.capabilities.discipline_manage ? (
              <button
                type="button"
                onClick={
                  () =>
                    setActiveTab(
                      "discipline"
                    )
                }
                className={[
                  "border-b-2 px-4 py-4 text-sm font-semibold",
                  activeTab ===
                  "discipline"
                    ? "border-foreground"
                    : "border-transparent text-muted-foreground",
                ].join(
                  " "
                )}
              >
                Discipline
              </button>
            ) : null}


            {data.capabilities.documents_manage ? (
              <button
                type="button"
                onClick={
                  () =>
                    setActiveTab(
                      "documents"
                    )
                }
                className={[
                  "border-b-2 px-4 py-4 text-sm font-semibold",
                  activeTab ===
                  "documents"
                    ? "border-foreground"
                    : "border-transparent text-muted-foreground",
                ].join(
                  " "
                )}
              >
                Documents
              </button>
            ) : null}

          </div>
        </div>


        {activeTab ===
        "performance" ? (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">

            {data.capabilities.performance_manage ? (
              <Panel
                title={
                  performanceForm.id
                    ? "Edit performance review"
                    : "New performance review"
                }
              >
                <div className="grid gap-4">

                  <Field label="Employee">
                    <SearchableSelect searchLabel="Employees"
                      value={
                        performanceForm.employee_id ||
                        selectedEmployeeId
                      }
                      onValueChange={
                        (
                          selectedValue
                        ) =>
                          setPerformanceForm({
                            ...performanceForm,
                            employee_id:
                              selectedValue,
                          })
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="">
                        Choose employee
                      </option>

                      {data.employees.map(
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
                            {employee.full_name}
                          </option>
                        )
                      )}
                    </SearchableSelect>
                  </Field>


                  <div className="grid grid-cols-2 gap-3">

                    <Field label="Period start">
                      <input
                        type="date"
                        value={
                          performanceForm.period_start
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm({
                              ...performanceForm,
                              period_start:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Period end">
                      <input
                        type="date"
                        value={
                          performanceForm.period_end
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm({
                              ...performanceForm,
                              period_end:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>

                  </div>


                  <Field label="Rating 1–5">
                    <input
                      type="number"
                      min="1"
                      max="5"
                      step="0.5"
                      value={
                        performanceForm.rating
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPerformanceForm({
                            ...performanceForm,
                            rating:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    />
                  </Field>


                  <Field label="Status">
                    <select
                      value={
                        performanceForm.status
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPerformanceForm({
                            ...performanceForm,
                            status:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="draft">
                        Draft
                      </option>

                      <option value="submitted">
                        Submit to employee
                      </option>

                      <option value="closed">
                        Closed
                      </option>
                    </select>
                  </Field>


                  <Field label="Summary">
                    <textarea
                      value={
                        performanceForm.summary
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPerformanceForm({
                            ...performanceForm,
                            summary:
                              event.target.value,
                          })
                      }
                      className={
                        textareaClass
                      }
                    />
                  </Field>


                  <Field label="Strengths">
                    <textarea
                      value={
                        performanceForm.strengths
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPerformanceForm({
                            ...performanceForm,
                            strengths:
                              event.target.value,
                          })
                      }
                      className={
                        textareaClass
                      }
                    />
                  </Field>


                  <Field label="Improvement areas">
                    <textarea
                      value={
                        performanceForm.improvement_areas
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPerformanceForm({
                            ...performanceForm,
                            improvement_areas:
                              event.target.value,
                          })
                      }
                      className={
                        textareaClass
                      }
                    />
                  </Field>


                  <Field label="Goals">
                    <textarea
                      value={
                        performanceForm.goals
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPerformanceForm({
                            ...performanceForm,
                            goals:
                              event.target.value,
                          })
                      }
                      className={
                        textareaClass
                      }
                    />
                  </Field>


                  <div className="flex flex-wrap gap-2">

                    <Button
                      primary
                      disabled={
                        busy ===
                        "performance-save"
                      }
                      onClick={
                        () =>
                          void savePerformance()
                      }
                    >
                      <Save className="h-4 w-4" />
                      Save Review
                    </Button>


                    {performanceForm.id ? (
                      <Button
                        onClick={
                          resetPerformance
                        }
                      >
                        Cancel Edit
                      </Button>
                    ) : null}

                  </div>

                </div>
              </Panel>
            ) : null}


            <Panel
              title="Performance history"
              description="Published employee reviews and management review history."
            >

              {data.performance_reviews.length ===
              0 ? (
                <p className="text-sm text-muted-foreground">
                  No performance reviews yet.
                </p>
              ) : (
                <div className="space-y-4">

                  {data.performance_reviews.map(
                    (
                      review
                    ) => (
                      <div
                        key={
                          review.id
                        }
                        className="rounded-2xl border p-4"
                      >

                        <div className="flex flex-wrap items-start justify-between gap-3">

                          <div>
                            <p className="font-bold">
                              {review.employee_name}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {review.employee_number}
                              {" · "}
                              {humanDate(
                                review.period_start
                              )}
                              {" → "}
                              {humanDate(
                                review.period_end
                              )}
                            </p>
                          </div>


                          <div className="flex items-center gap-2">

                            {review.rating !==
                            null ? (
                              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold">
                                <Star className="h-3.5 w-3.5" />
                                {review.rating}/5
                              </span>
                            ) : null}

                            <Badge
                              value={
                                review.status
                              }
                            />

                          </div>

                        </div>


                        {review.summary ? (
                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              Summary
                            </p>

                            <p className="mt-1 text-sm">
                              {review.summary}
                            </p>
                          </div>
                        ) : null}


                        <div className="mt-4 grid gap-3 md:grid-cols-3">

                          <div className="rounded-xl bg-muted/40 p-3">
                            <p className="text-xs font-semibold text-muted-foreground">
                              Strengths
                            </p>

                            <p className="mt-1 text-sm">
                              {review.strengths ||
                                "—"}
                            </p>
                          </div>


                          <div className="rounded-xl bg-muted/40 p-3">
                            <p className="text-xs font-semibold text-muted-foreground">
                              Improve
                            </p>

                            <p className="mt-1 text-sm">
                              {review.improvement_areas ||
                                "—"}
                            </p>
                          </div>


                          <div className="rounded-xl bg-muted/40 p-3">
                            <p className="text-xs font-semibold text-muted-foreground">
                              Goals
                            </p>

                            <p className="mt-1 text-sm">
                              {review.goals ||
                                "—"}
                            </p>
                          </div>

                        </div>


                        {review.employee_comments ? (
                          <div className="mt-3 rounded-xl border p-3">
                            <p className="text-xs font-semibold text-muted-foreground">
                              Employee comments
                            </p>

                            <p className="mt-1 text-sm">
                              {review.employee_comments}
                            </p>
                          </div>
                        ) : null}


                        {data.capabilities.performance_manage ? (
                          <div className="mt-4">

                            <Button
                              onClick={
                                () =>
                                  editPerformance(
                                    review
                                  )
                              }
                            >
                              Edit Review
                            </Button>

                          </div>
                        ) : null}


                        {mode ===
                          "self" &&
                        review.employee_id ===
                          data.own_employee_id &&
                        review.status ===
                          "submitted" ? (
                          <div className="mt-4 rounded-xl border p-3">

                            <Field label="My comments">
                              <textarea
                                value={
                                  acknowledgeComments[
                                    review.id
                                  ] ??
                                  ""
                                }
                                onChange={
                                  (
                                    event
                                  ) =>
                                    setAcknowledgeComments({
                                      ...acknowledgeComments,
                                      [review.id]:
                                        event.target.value,
                                    })
                                }
                                placeholder="Optional comment before acknowledgement"
                                className={
                                  textareaClass
                                }
                              />
                            </Field>


                            <div className="mt-3">

                              <Button
                                primary
                                disabled={
                                  busy ===
                                  `ack-${review.id}`
                                }
                                onClick={
                                  () =>
                                    void acknowledgePerformance(
                                      review.id
                                    )
                                }
                              >
                                <UserCheck className="h-4 w-4" />
                                Acknowledge Review
                              </Button>

                            </div>

                          </div>
                        ) : null}

                      </div>
                    )
                  )}

                </div>
              )}

            </Panel>

          </div>
        ) : null}


        {activeTab ===
          "discipline" &&
        data.capabilities.discipline_manage ? (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">

            <Panel
              title={
                disciplineForm.id
                  ? "Edit disciplinary record"
                  : "New disciplinary record"
              }
              description="Restricted to owner/admin."
            >
              <div className="grid gap-4">

                <Field label="Employee">
                  <SearchableSelect searchLabel="Employees"
                    value={
                      disciplineForm.employee_id ||
                      selectedEmployeeId
                    }
                    onValueChange={
                      (
                        selectedValue
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          employee_id:
                            selectedValue,
                        })
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="">
                      Choose employee
                    </option>

                    {data.employees.map(
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
                          {employee.full_name}
                        </option>
                      )
                    )}
                  </SearchableSelect>
                </Field>


                <Field label="Case type">
                  <select
                    value={
                      disciplineForm.case_type
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          case_type:
                            event.target.value,
                        })
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="counselling">
                      Counselling
                    </option>

                    <option value="verbal_warning">
                      Verbal warning
                    </option>

                    <option value="written_warning">
                      Written warning
                    </option>

                    <option value="final_written_warning">
                      Final written warning
                    </option>

                    <option value="investigation">
                      Investigation
                    </option>

                    <option value="misconduct">
                      Misconduct
                    </option>

                    <option value="other">
                      Other
                    </option>
                  </select>
                </Field>


                <Field label="Incident date">
                  <input
                    type="date"
                    value={
                      disciplineForm.incident_date
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          incident_date:
                            event.target.value,
                        })
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>


                <Field label="Status">
                  <select
                    value={
                      disciplineForm.status
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          status:
                            event.target.value,
                        })
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="open">
                      Open
                    </option>

                    <option value="issued">
                      Issued
                    </option>

                    <option value="appealed">
                      Appealed
                    </option>

                    <option value="closed">
                      Closed
                    </option>

                    <option value="withdrawn">
                      Withdrawn
                    </option>
                  </select>
                </Field>


                <Field label="Summary">
                  <textarea
                    value={
                      disciplineForm.summary
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          summary:
                            event.target.value,
                        })
                    }
                    className={
                      textareaClass
                    }
                  />
                </Field>


                <Field label="Details">
                  <textarea
                    value={
                      disciplineForm.details
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          details:
                            event.target.value,
                        })
                    }
                    className={
                      textareaClass
                    }
                  />
                </Field>


                <Field label="Action taken">
                  <textarea
                    value={
                      disciplineForm.action_taken
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          action_taken:
                            event.target.value,
                        })
                    }
                    className={
                      textareaClass
                    }
                  />
                </Field>


                <Field label="Expiry date">
                  <input
                    type="date"
                    value={
                      disciplineForm.expiry_date
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDisciplineForm({
                          ...disciplineForm,
                          expiry_date:
                            event.target.value,
                        })
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>


                <div className="flex gap-2">

                  <Button
                    primary
                    disabled={
                      busy ===
                      "discipline-save"
                    }
                    onClick={
                      () =>
                        void saveDiscipline()
                    }
                  >
                    <Save className="h-4 w-4" />
                    Save Record
                  </Button>


                  {disciplineForm.id ? (
                    <Button
                      onClick={
                        resetDiscipline
                      }
                    >
                      Cancel Edit
                    </Button>
                  ) : null}

                </div>

              </div>
            </Panel>


            <Panel
              title="Disciplinary history"
              description="Sensitive HR history."
            >

              {data.disciplinary_cases.length ===
              0 ? (
                <p className="text-sm text-muted-foreground">
                  No disciplinary records.
                </p>
              ) : (
                <div className="space-y-4">

                  {data.disciplinary_cases.map(
                    (
                      item
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        className="rounded-2xl border p-4"
                      >

                        <div className="flex flex-wrap justify-between gap-3">

                          <div>
                            <p className="font-bold">
                              {item.employee_name}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {humanDate(
                                item.incident_date
                              )}
                              {" · "}
                              {
                                item.case_type.replaceAll(
                                  "_",
                                  " "
                                )
                              }
                            </p>
                          </div>

                          <Badge
                            value={
                              item.status
                            }
                          />

                        </div>


                        <p className="mt-4 font-semibold">
                          {item.summary}
                        </p>


                        {item.details ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {item.details}
                          </p>
                        ) : null}


                        {item.action_taken ? (
                          <div className="mt-3 rounded-xl bg-muted/40 p-3">
                            <p className="text-xs font-semibold text-muted-foreground">
                              Action taken
                            </p>

                            <p className="mt-1 text-sm">
                              {item.action_taken}
                            </p>
                          </div>
                        ) : null}


                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">

                          <p className="text-xs text-muted-foreground">
                            Expires: {humanDate(
                              item.expiry_date
                            )}
                          </p>


                          <Button
                            onClick={
                              () =>
                                editDiscipline(
                                  item
                                )
                            }
                          >
                            Edit
                          </Button>

                        </div>

                      </div>
                    )
                  )}

                </div>
              )}

            </Panel>

          </div>
        ) : null}


        {activeTab ===
          "documents" &&
        data.capabilities.documents_manage ? (
          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">

            <Panel
              title={
                documentForm.id
                  ? "Edit document record"
                  : "New HR document record"
              }
              description="Document metadata only. Secure binary file storage comes next."
            >
              <div className="grid gap-4">

                <Field label="Employee">
                  <SearchableSelect searchLabel="Employees"
                    value={
                      documentForm.employee_id ||
                      selectedEmployeeId
                    }
                    onValueChange={
                      (
                        selectedValue
                      ) =>
                        setDocumentForm({
                          ...documentForm,
                          employee_id:
                            selectedValue,
                        })
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="">
                      Choose employee
                    </option>

                    {data.employees.map(
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
                          {employee.full_name}
                        </option>
                      )
                    )}
                  </SearchableSelect>
                </Field>


                <Field label="Document type">
                  <select
                    value={
                      documentForm.document_type
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDocumentForm({
                          ...documentForm,
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
                      ID document
                    </option>

                    <option value="certificate">
                      Certificate
                    </option>

                    <option value="medical_note">
                      Medical note
                    </option>

                    <option value="warning">
                      Warning
                    </option>

                    <option value="performance">
                      Performance
                    </option>

                    <option value="policy_acknowledgement">
                      Policy acknowledgement
                    </option>

                    <option value="other">
                      Other
                    </option>
                  </select>
                </Field>


                <Field label="Title">
                  <input
                    value={
                      documentForm.title
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDocumentForm({
                          ...documentForm,
                          title:
                            event.target.value,
                        })
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>


                <Field label="Storage reference">
                  <input
                    value={
                      documentForm.file_path
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDocumentForm({
                          ...documentForm,
                          file_path:
                            event.target.value,
                        })
                    }
                    placeholder="Metadata only for now"
                    className={
                      inputClass
                    }
                  />
                </Field>


                <div className="grid grid-cols-2 gap-3">

                  <Field label="Issued">
                    <input
                      type="date"
                      value={
                        documentForm.issued_date
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setDocumentForm({
                            ...documentForm,
                            issued_date:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    />
                  </Field>


                  <Field label="Expiry">
                    <input
                      type="date"
                      value={
                        documentForm.expiry_date
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setDocumentForm({
                            ...documentForm,
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


                <Field label="Status">
                  <select
                    value={
                      documentForm.status
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDocumentForm({
                          ...documentForm,
                          status:
                            event.target.value,
                        })
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="current">
                      Current
                    </option>

                    <option value="expired">
                      Expired
                    </option>

                    <option value="archived">
                      Archived
                    </option>
                  </select>
                </Field>


                <Field label="Notes">
                  <textarea
                    value={
                      documentForm.notes
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDocumentForm({
                          ...documentForm,
                          notes:
                            event.target.value,
                        })
                    }
                    className={
                      textareaClass
                    }
                  />
                </Field>


                <div className="flex gap-2">

                  <Button
                    primary
                    disabled={
                      busy ===
                      "document-save"
                    }
                    onClick={
                      () =>
                        void saveDocument()
                    }
                  >
                    <Save className="h-4 w-4" />
                    Save Document
                  </Button>


                  {documentForm.id ? (
                    <Button
                      onClick={
                        resetDocument
                      }
                    >
                      Cancel Edit
                    </Button>
                  ) : null}

                </div>

              </div>
            </Panel>


            <Panel
              title="Document history"
              description="Owner/admin controlled HR metadata."
            >

              {data.documents.length ===
              0 ? (
                <p className="text-sm text-muted-foreground">
                  No HR documents recorded.
                </p>
              ) : (
                <div className="space-y-3">

                  {data.documents.map(
                    (
                      item
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        className="rounded-2xl border p-4"
                      >

                        <div className="flex flex-wrap justify-between gap-3">

                          <div>
                            <p className="font-bold">
                              {item.title}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {item.employee_name}
                              {" · "}
                              {
                                item.document_type.replaceAll(
                                  "_",
                                  " "
                                )
                              }
                            </p>
                          </div>


                          <Badge
                            value={
                              item.status
                            }
                          />

                        </div>


                        <div className="mt-4 grid gap-3 sm:grid-cols-2">

                          <div className="rounded-xl bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              Issued
                            </p>

                            <p className="mt-1 text-sm font-semibold">
                              {humanDate(
                                item.issued_date
                              )}
                            </p>
                          </div>


                          <div className="rounded-xl bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              Expires
                            </p>

                            <p className="mt-1 text-sm font-semibold">
                              {humanDate(
                                item.expiry_date
                              )}
                            </p>
                          </div>

                        </div>


                        {item.notes ? (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {item.notes}
                          </p>
                        ) : null}


                        {item.file_path ? (
                          <p className="mt-3 break-all text-xs text-muted-foreground">
                            Storage reference: {item.file_path}
                          </p>
                        ) : null}


                        <div className="mt-4">

                          <Button
                            onClick={
                              () =>
                                editDocument(
                                  item
                                )
                            }
                          >
                            Edit
                          </Button>

                        </div>

                      </div>
                    )
                  )}

                </div>
              )}

            </Panel>

          </div>
        ) : null}

      </main>

    </DashboardLayout>
  );
}
