"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AlertTriangle,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Coins,
  FileCheck2,
  Landmark,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type EmployerSettings = {
  currency: string;

  pay_frequency:
    | "weekly"
    | "fortnightly"
    | "monthly";

  default_payment_day:
    number | null;

  paye_enabled: boolean;
  uif_enabled: boolean;
  sdl_enabled: boolean;

  paye_reference: string | null;
  uif_reference: string | null;
  sdl_reference: string | null;

  payroll_notes: string | null;
};


type EmployeeProfile = {
  id: string;

  compensation_type:
    | "salaried"
    | "hourly";

  pay_frequency:
    | "weekly"
    | "fortnightly"
    | "monthly";

  basic_salary_monthly: number;
  hourly_rate: number;

  tax_number: string | null;
  birth_date: string | null;

  paye_exempt: boolean;

  uif_exempt: boolean;
  uif_exemption_reason: string | null;

  medical_scheme_main_member: boolean;
  medical_scheme_dependants: number;
};


type Employee = {
  employee_id: string;
  employee_number: string;
  employee_name: string;

  status: string;

  branch_id: string | null;
  branch_name: string | null;

  profile: EmployeeProfile | null;
};


type ComponentDefinition = {
  id: string;
  code: string;
  name: string;

  category:
    | "earning"
    | "deduction"
    | "employer_contribution"
    | "information";

  taxable: boolean;

  paye_remuneration: boolean;
  uif_remuneration: boolean;
  sdl_remuneration: boolean;

  is_active: boolean;
};


type PayRun = {
  id: string;

  branch_id: string | null;

  period_start: string;
  period_end: string;
  payment_date: string;

  pay_frequency: string;

  tax_year: number;

  status: string;

  created_at: string;
};


type PayeBracket = {
  from: number;
  to: number | null;
  base_tax: number;
  rate: number;
  over: number;
};


type StatutoryRules = {
  paye_brackets: PayeBracket[];

  rebates: {
    primary: number;
    secondary: number;
    tertiary: number;
  };

  thresholds: {
    under_65: number;
    age_65_to_74: number;
    age_75_plus: number;
  };

  medical_tax_credit_monthly: {
    taxpayer: number;
    first_dependent: number;
    additional_dependent: number;
  };

  uif: {
    employee_rate: number;
    employer_rate: number;

    monthly_ceiling: number;

    max_employee_monthly: number;
    max_employer_monthly: number;
  };

  sdl: {
    employer_rate: number;

    annual_remuneration_exemption_threshold:
      number;
  };

  tax_period: {
    start: string;
    end: string;
  };

  emp201_due_rule: string;
};


type StatutoryRule = {
  tax_year: number;

  effective_from: string;
  effective_to: string;

  source_title: string;
  source_url: string;

  rules: StatutoryRules;
};


type Workspace = {
  ok: boolean;

  settings: EmployerSettings;

  statutory_rule: StatutoryRule | null;

  employees: Employee[];

  components: ComponentDefinition[];

  pay_runs: PayRun[];
};


type Preview = {
  ok: boolean;

  gross_monthly: number;

  uif_employee: number;
  uif_employer: number;
  sdl_employer: number;

  paye_status: string;

  rule_source: string;
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


function monthStart() {
  const now =
    new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(
    2,
    "0"
  )}-01`;
}


function monthEnd() {
  const now =
    new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  )
    .toISOString()
    .slice(
      0,
      10
    );
}


function money(
  value: unknown
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(
    Number(
      value ??
      0
    )
  );
}


function percentage(
  value: number
) {
  return `${(
    value *
    100
  ).toFixed(
    value *
      100 %
      1 ===
      0
      ? 0
      : 2
  )}%`;
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


function Stat({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5">

      <div className="text-muted-foreground">
        {icon}
      </div>


      <p className="mt-3 text-2xl font-bold">
        {value}
      </p>


      <p className="mt-1 text-sm font-semibold">
        {title}
      </p>


      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}

    </div>
  );
}


function Badge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
      {value.replaceAll(
        "_",
        " "
      )}
    </span>
  );
}


export default function PayrollPage() {
  const [
    workspace,
    setWorkspace,
  ] =
    useState<Workspace | null>(
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
    activeTab,
    setActiveTab,
  ] =
    useState<
      | "overview"
      | "employees"
      | "runs"
      | "compliance"
    >(
      "overview"
    );


  const [
    settingsForm,
    setSettingsForm,
  ] =
    useState({
      pay_frequency:
        "monthly",

      default_payment_day:
        "25",

      paye_enabled:
        false,

      uif_enabled:
        true,

      sdl_enabled:
        false,

      paye_reference:
        "",

      uif_reference:
        "",

      sdl_reference:
        "",

      payroll_notes:
        "",
    });


  const [
    selectedEmployee,
    setSelectedEmployee,
  ] =
    useState<Employee | null>(
      null
    );


  const [
    employeeForm,
    setEmployeeForm,
  ] =
    useState({
      compensation_type:
        "salaried",

      pay_frequency:
        "monthly",

      basic_salary_monthly:
        "0",

      hourly_rate:
        "0",

      tax_number:
        "",

      birth_date:
        "",

      paye_exempt:
        false,

      uif_exempt:
        false,

      uif_exemption_reason:
        "",

      medical_scheme_main_member:
        false,

      medical_scheme_dependants:
        "0",
    });


  const [
    preview,
    setPreview,
  ] =
    useState<Preview | null>(
      null
    );


  const [
    runForm,
    setRunForm,
  ] =
    useState({
      period_start:
        monthStart(),

      period_end:
        monthEnd(),

      payment_date:
        today(),

      branch_id:
        "",

      notes:
        "",
    });


  async function load() {
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
      window.location.href =
        "/login";

      return;
    }


    const {
      data,
      error:
        rpcError,
    } =
      await supabase.rpc(
        "get_payroll_foundation_workspace"
      );


    if (
      rpcError
    ) {
      throw rpcError;
    }


    const result =
      data as Workspace;


    setWorkspace(
      result
    );


    setSettingsForm({
      pay_frequency:
        result.settings.pay_frequency,

      default_payment_day:
        result.settings.default_payment_day !==
        null
          ? String(
              result.settings.default_payment_day
            )
          : "",

      paye_enabled:
        result.settings.paye_enabled,

      uif_enabled:
        result.settings.uif_enabled,

      sdl_enabled:
        result.settings.sdl_enabled,

      paye_reference:
        result.settings.paye_reference ??
        "",

      uif_reference:
        result.settings.uif_reference ??
        "",

      sdl_reference:
        result.settings.sdl_reference ??
        "",

      payroll_notes:
        result.settings.payroll_notes ??
        "",
    });
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
              : "Unable to load Nexus Payroll."
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


  const configuredEmployees =
    useMemo(
      () =>
        workspace?.employees.filter(
          (
            employee
          ) =>
            Boolean(
              employee.profile
            )
        ).length ??
        0,
      [
        workspace,
      ]
    );


  const branches =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            string
          >();


        for (
          const employee
          of workspace?.employees ??
          []
        ) {
          if (
            employee.branch_id &&
            employee.branch_name
          ) {
            map.set(
              employee.branch_id,
              employee.branch_name
            );
          }
        }


        return Array.from(
          map.entries()
        ).map(
          (
            [
              id,
              name,
            ]
          ) => ({
            id,
            name,
          })
        );
      },
      [
        workspace,
      ]
    );


  async function refresh() {
    setBusy(
      "refresh"
    );

    setError(
      ""
    );

    setSuccess(
      ""
    );


    try {
      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to refresh payroll."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function saveSettings() {
    setBusy(
      "settings"
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
          "save_payroll_employer_settings",
          {
            p_pay_frequency:
              settingsForm.pay_frequency,

            p_default_payment_day:
              settingsForm.default_payment_day
                ? Number(
                    settingsForm.default_payment_day
                  )
                : null,

            p_paye_enabled:
              settingsForm.paye_enabled,

            p_uif_enabled:
              settingsForm.uif_enabled,

            p_sdl_enabled:
              settingsForm.sdl_enabled,

            p_paye_reference:
              settingsForm.paye_reference ||
              null,

            p_uif_reference:
              settingsForm.uif_reference ||
              null,

            p_sdl_reference:
              settingsForm.sdl_reference ||
              null,

            p_payroll_notes:
              settingsForm.payroll_notes ||
              null,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      setSuccess(
        "Payroll employer settings saved."
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save payroll settings."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function openEmployee(
    employee:
      Employee
  ) {
    setSelectedEmployee(
      employee
    );


    setPreview(
      null
    );


    const profile =
      employee.profile;


    setEmployeeForm({
      compensation_type:
        profile?.compensation_type ??
        "salaried",

      pay_frequency:
        profile?.pay_frequency ??
        workspace?.settings.pay_frequency ??
        "monthly",

      basic_salary_monthly:
        String(
          profile?.basic_salary_monthly ??
          0
        ),

      hourly_rate:
        String(
          profile?.hourly_rate ??
          0
        ),

      tax_number:
        profile?.tax_number ??
        "",

      birth_date:
        profile?.birth_date ??
        "",

      paye_exempt:
        profile?.paye_exempt ??
        false,

      uif_exempt:
        profile?.uif_exempt ??
        false,

      uif_exemption_reason:
        profile?.uif_exemption_reason ??
        "",

      medical_scheme_main_member:
        profile?.medical_scheme_main_member ??
        false,

      medical_scheme_dependants:
        String(
          profile?.medical_scheme_dependants ??
          0
        ),
    });
  }


  async function saveEmployee() {
    if (
      !selectedEmployee
    ) {
      return;
    }


    setBusy(
      "employee"
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
          "save_payroll_employee_profile",
          {
            p_employee_id:
              selectedEmployee.employee_id,

            p_compensation_type:
              employeeForm.compensation_type,

            p_pay_frequency:
              employeeForm.pay_frequency,

            p_basic_salary_monthly:
              Number(
                employeeForm.basic_salary_monthly ||
                0
              ),

            p_hourly_rate:
              Number(
                employeeForm.hourly_rate ||
                0
              ),

            p_tax_number:
              employeeForm.tax_number ||
              null,

            p_birth_date:
              employeeForm.birth_date ||
              null,

            p_paye_exempt:
              employeeForm.paye_exempt,

            p_uif_exempt:
              employeeForm.uif_exempt,

            p_uif_exemption_reason:
              employeeForm.uif_exemption_reason ||
              null,

            p_medical_scheme_main_member:
              employeeForm.medical_scheme_main_member,

            p_medical_scheme_dependants:
              Number(
                employeeForm.medical_scheme_dependants ||
                0
              ),
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      setSuccess(
        `Payroll profile saved for ${selectedEmployee.employee_name}.`
      );


      setSelectedEmployee(
        null
      );


      setPreview(
        null
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save employee payroll profile."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function previewContributions() {
    if (
      !selectedEmployee?.profile &&
      !workspace?.employees.find(
        (
          employee
        ) =>
          employee.employee_id ===
          selectedEmployee?.employee_id
      )?.profile
    ) {
      setError(
        "Save the employee payroll profile before previewing statutory contributions."
      );

      return;
    }


    setBusy(
      "preview"
    );

    setError(
      ""
    );


    try {
      const gross =
        employeeForm.compensation_type ===
          "salaried"
          ? Number(
              employeeForm.basic_salary_monthly ||
              0
            )
          : Number(
              employeeForm.hourly_rate ||
              0
            ) *
            173.33;


      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "preview_payroll_statutory_contributions",
          {
            p_employee_id:
              selectedEmployee?.employee_id,

            p_gross_monthly:
              gross,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      setPreview(
        data as Preview
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to preview statutory contributions."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function createPayRun() {
    setBusy(
      "run"
    );

    setError(
      ""
    );

    setSuccess(
      ""
    );


    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "create_payroll_pay_run",
          {
            p_period_start:
              runForm.period_start,

            p_period_end:
              runForm.period_end,

            p_payment_date:
              runForm.payment_date,

            p_branch_id:
              runForm.branch_id ||
              null,

            p_notes:
              runForm.notes ||
              null,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      const result =
        data as {
          id: string;
          tax_year: number;
        };


      setSuccess(
        `Draft payroll run created for tax year ${result.tax_year}.`
      );


      setRunForm({
        period_start:
          monthStart(),

        period_end:
          monthEnd(),

        payment_date:
          today(),

        branch_id:
          "",

        notes:
          "",
      });


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create payroll run."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  if (
    loading
  ) {
    return (
      <DashboardLayout>

        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Loading Nexus Payroll...
          </p>
        </div>

      </DashboardLayout>
    );
  }


  const rule =
    workspace?.statutory_rule;


  return (
    <DashboardLayout>

      <main className="mx-auto max-w-[1650px] space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              JINLAB Nexus Payroll
            </p>


            <h1 className="mt-1 text-2xl font-bold">
              South African Payroll & Compliance
            </h1>


            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Secure payroll configuration with versioned statutory rules and audit-ready pay runs.
            </p>

          </div>


          <button
            type="button"
            disabled={
              busy ===
              "refresh"
            }
            onClick={
              () =>
                void refresh()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />

            Refresh
          </button>

        </div>


        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">

          <div className="flex gap-3">

            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-900" />


            <div>

              <p className="font-semibold text-amber-950">
                Payroll compliance safety mode
              </p>


              <p className="mt-1 text-sm text-amber-900">
                Sprint 23.1 stores verified statutory rates and calculates the UIF/SDL foundation. Production PAYE calculation is intentionally not enabled yet. The PAYE engine, annualisation, medical credits, retirement deductions, directives and variable remuneration logic will be completed and validated in Sprint 23.2.
              </p>

            </div>

          </div>

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
                title="HR Employees"
                value={
                  workspace.employees.length
                }
                description="Available for payroll"
                icon={
                  <Users className="h-5 w-5" />
                }
              />


              <Stat
                title="Payroll Configured"
                value={
                  configuredEmployees
                }
                description="Employees with payroll profiles"
                icon={
                  <WalletCards className="h-5 w-5" />
                }
              />


              <Stat
                title="Current Tax Year"
                value={
                  rule
                    ? rule.tax_year
                    : "—"
                }
                description={
                  rule
                    ? `${rule.effective_from} → ${rule.effective_to}`
                    : "No active statutory rule"
                }
                icon={
                  <Landmark className="h-5 w-5" />
                }
              />


              <Stat
                title="Pay Runs"
                value={
                  workspace.pay_runs.length
                }
                description="Draft and historical runs"
                icon={
                  <CalendarDays className="h-5 w-5" />
                }
              />

            </div>


            <div className="overflow-x-auto rounded-2xl border bg-background px-3">

              <div className="flex min-w-max">

                {[
                  [
                    "overview",
                    "Overview",
                  ],
                  [
                    "employees",
                    "Employees",
                  ],
                  [
                    "runs",
                    "Pay Runs",
                  ],
                  [
                    "compliance",
                    "Statutory Rules",
                  ],
                ].map(
                  (
                    [
                      key,
                      label,
                    ]
                  ) => (
                    <button
                      key={
                        key
                      }
                      type="button"
                      onClick={
                        () =>
                          setActiveTab(
                            key as typeof activeTab
                          )
                      }
                      className={[
                        "border-b-2 px-4 py-4 text-sm font-semibold",
                        activeTab ===
                          key
                          ? "border-foreground"
                          : "border-transparent text-muted-foreground",
                      ].join(
                        " "
                      )}
                    >
                      {label}
                    </button>
                  )
                )}

              </div>

            </div>


            {activeTab ===
            "overview" ? (
              <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">

                <Panel
                  title="Employer Payroll Settings"
                  description="Payroll tax registrations and company payroll behaviour."
                >

                  <div className="grid gap-4">

                    <Field label="Default pay frequency">

                      <select
                        value={
                          settingsForm.pay_frequency
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setSettingsForm({
                              ...settingsForm,

                              pay_frequency:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="weekly">
                          Weekly
                        </option>

                        <option value="fortnightly">
                          Fortnightly
                        </option>

                        <option value="monthly">
                          Monthly
                        </option>
                      </select>

                    </Field>


                    <Field label="Default monthly payment day">

                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={
                          settingsForm.default_payment_day
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setSettingsForm({
                              ...settingsForm,

                              default_payment_day:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <div className="grid gap-3 sm:grid-cols-3">

                      <label className="rounded-xl border p-4">

                        <input
                          type="checkbox"
                          checked={
                            settingsForm.paye_enabled
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setSettingsForm({
                                ...settingsForm,

                                paye_enabled:
                                  event.target.checked,
                              })
                          }
                        />

                        <p className="mt-2 font-semibold">
                          PAYE
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Employer registered
                        </p>

                      </label>


                      <label className="rounded-xl border p-4">

                        <input
                          type="checkbox"
                          checked={
                            settingsForm.uif_enabled
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setSettingsForm({
                                ...settingsForm,

                                uif_enabled:
                                  event.target.checked,
                              })
                          }
                        />

                        <p className="mt-2 font-semibold">
                          UIF
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Contributions enabled
                        </p>

                      </label>


                      <label className="rounded-xl border p-4">

                        <input
                          type="checkbox"
                          checked={
                            settingsForm.sdl_enabled
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setSettingsForm({
                                ...settingsForm,

                                sdl_enabled:
                                  event.target.checked,
                              })
                          }
                        />

                        <p className="mt-2 font-semibold">
                          SDL
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Employer liable
                        </p>

                      </label>

                    </div>


                    <Field label="PAYE reference">

                      <input
                        value={
                          settingsForm.paye_reference
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setSettingsForm({
                              ...settingsForm,

                              paye_reference:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <Field label="UIF reference">

                      <input
                        value={
                          settingsForm.uif_reference
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setSettingsForm({
                              ...settingsForm,

                              uif_reference:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <Field label="SDL reference">

                      <input
                        value={
                          settingsForm.sdl_reference
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setSettingsForm({
                              ...settingsForm,

                              sdl_reference:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <Field label="Payroll notes">

                      <textarea
                        value={
                          settingsForm.payroll_notes
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setSettingsForm({
                              ...settingsForm,

                              payroll_notes:
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
                        "settings"
                      }
                      onClick={
                        () =>
                          void saveSettings()
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />

                      Save Payroll Settings
                    </button>

                  </div>

                </Panel>


                <Panel
                  title="Compliance Architecture"
                  description="Statutory rules are kept outside the payroll formulas and versioned by effective date."
                >

                  <div className="space-y-3">

                    <ArchitectureCard
                      title="Versioned Statutory Rules"
                      description="PAYE brackets, rebates, tax thresholds, UIF ceilings, SDL rates and medical credits are stored by tax year."
                    />


                    <ArchitectureCard
                      title="Sensitive Employee Payroll"
                      description="Salary, tax number and payroll configuration use payroll-specific permissions rather than ordinary HR manager access."
                    />


                    <ArchitectureCard
                      title="Immutable Pay Runs"
                      description="Draft payroll will later move through calculate → approve → post → pay. Approved runs will not be silently rewritten."
                    />


                    <ArchitectureCard
                      title="Accounting Integration"
                      description="Payroll liabilities and salary expense journals will be posted into Nexus Accounting only after payroll approval."
                    />


                    <ArchitectureCard
                      title="Statutory Exports"
                      description="EMP201, IRP5/IT3(a), EMP501 and reconciliation packs belong in the compliance layer, not handwritten spreadsheets."
                    />


                    <ArchitectureCard
                      title="Human Review"
                      description="Tax directives, unusual benefits, uncertain remuneration and legal exceptions must be escalated instead of guessed."
                    />

                  </div>

                </Panel>

              </div>
            ) : null}


            {activeTab ===
            "employees" ? (
              <Panel
                title="Employee Payroll Profiles"
                description="Payroll identity is linked to the existing Nexus HR employee."
              >

                <div className="overflow-x-auto">

                  <table className="w-full min-w-[1050px] text-sm">

                    <thead>

                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">

                        <th className="p-3">
                          Employee
                        </th>

                        <th className="p-3">
                          Branch
                        </th>

                        <th className="p-3">
                          Compensation
                        </th>

                        <th className="p-3">
                          Basic / Rate
                        </th>

                        <th className="p-3">
                          PAYE
                        </th>

                        <th className="p-3">
                          UIF
                        </th>

                        <th className="p-3">
                          Status
                        </th>

                        <th className="p-3">
                          Action
                        </th>

                      </tr>

                    </thead>


                    <tbody>

                      {workspace.employees.map(
                        (
                          employee
                        ) => (
                          <tr
                            key={
                              employee.employee_id
                            }
                            className="border-b last:border-0"
                          >

                            <td className="p-3">

                              <p className="font-semibold">
                                {employee.employee_name}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {employee.employee_number}
                              </p>

                            </td>


                            <td className="p-3">
                              {employee.branch_name ??
                                "Not assigned"}
                            </td>


                            <td className="p-3 capitalize">
                              {employee.profile?.compensation_type ??
                                "Not configured"}
                            </td>


                            <td className="p-3">

                              {employee.profile ? (
                                employee.profile.compensation_type ===
                                "salaried"
                                  ? money(
                                      employee.profile.basic_salary_monthly
                                    )
                                  : `${money(
                                      employee.profile.hourly_rate
                                    )} / hour`
                              ) : (
                                "—"
                              )}

                            </td>


                            <td className="p-3">

                              {employee.profile ? (
                                employee.profile.paye_exempt
                                  ? "Exempt"
                                  : "Applicable"
                              ) : (
                                "—"
                              )}

                            </td>


                            <td className="p-3">

                              {employee.profile ? (
                                employee.profile.uif_exempt
                                  ? "Exempt"
                                  : "Applicable"
                              ) : (
                                "—"
                              )}

                            </td>


                            <td className="p-3">

                              <Badge
                                value={
                                  employee.profile
                                    ? "configured"
                                    : "setup_required"
                                }
                              />

                            </td>


                            <td className="p-3">

                              <button
                                type="button"
                                onClick={
                                  () =>
                                    openEmployee(
                                      employee
                                    )
                                }
                                className="h-9 rounded-xl border px-3 text-xs font-semibold"
                              >
                                {employee.profile
                                  ? "Edit Payroll"
                                  : "Configure"}
                              </button>

                            </td>

                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                </div>

              </Panel>
            ) : null}


            {activeTab ===
            "runs" ? (
              <div className="grid gap-5 xl:grid-cols-[420px_1fr]">

                <Panel
                  title="New Draft Pay Run"
                  description="This creates the payroll period only. It does not calculate or pay employees yet."
                >

                  <div className="grid gap-4">

                    <Field label="Period start">

                      <input
                        type="date"
                        value={
                          runForm.period_start
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setRunForm({
                              ...runForm,

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
                          runForm.period_end
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setRunForm({
                              ...runForm,

                              period_end:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <Field label="Payment date">

                      <input
                        type="date"
                        value={
                          runForm.payment_date
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setRunForm({
                              ...runForm,

                              payment_date:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <Field label="Branch">

                      <SearchableSelect searchLabel="Branches"
                        value={
                          runForm.branch_id
                        }
                        onValueChange={
                          (
                            selectedValue
                          ) =>
                            setRunForm({
                              ...runForm,

                              branch_id:
                                selectedValue,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          All branches
                        </option>

                        {branches.map(
                          (
                            branch
                          ) => (
                            <option
                              key={
                                branch.id
                              }
                              value={
                                branch.id
                              }
                            >
                              {branch.name}
                            </option>
                          )
                        )}

                      </SearchableSelect>

                    </Field>


                    <Field label="Notes">

                      <textarea
                        value={
                          runForm.notes
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setRunForm({
                              ...runForm,

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
                        "run"
                      }
                      onClick={
                        () =>
                          void createPayRun()
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4" />

                      Create Draft Pay Run
                    </button>

                  </div>

                </Panel>


                <Panel
                  title="Pay Runs"
                  description="Payroll lifecycle starts in Draft and will become locked after approval."
                >

                  {workspace.pay_runs.length ===
                  0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">

                      <Coins className="mx-auto h-8 w-8 text-muted-foreground" />

                      <p className="mt-3 font-semibold">
                        No pay runs yet
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Create the first payroll period when the employer settings and employee profiles are ready.
                      </p>

                    </div>
                  ) : (
                    <div className="space-y-3">

                      {workspace.pay_runs.map(
                        (
                          run
                        ) => (
                          <div
                            key={
                              run.id
                            }
                            className="rounded-xl border p-4"
                          >

                            <div className="flex flex-wrap items-start justify-between gap-3">

                              <div>

                                <p className="font-bold">
                                  {run.period_start}
                                  {" → "}
                                  {run.period_end}
                                </p>

                                <p className="mt-1 text-sm text-muted-foreground">
                                  Payment {run.payment_date}
                                  {" · "}
                                  Tax year {run.tax_year}
                                </p>

                              </div>


                              <Badge
                                value={
                                  run.status
                                }
                              />

                            </div>


                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">

                              <span className="capitalize">
                                {run.pay_frequency}
                              </span>

                              <span>
                                Run {run.id.slice(
                                  0,
                                  8
                                )}
                              </span>

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
              "compliance" &&
            rule ? (
              <div className="space-y-5">

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

                  <Stat
                    title="Tax Year"
                    value={
                      rule.tax_year
                    }
                    description={`${rule.effective_from} → ${rule.effective_to}`}
                    icon={
                      <CalendarDays className="h-5 w-5" />
                    }
                  />


                  <Stat
                    title="UIF Employee"
                    value={
                      percentage(
                        rule.rules.uif.employee_rate
                      )
                    }
                    description={`Cap ${money(
                      rule.rules.uif.monthly_ceiling
                    )} remuneration`}
                    icon={
                      <Coins className="h-5 w-5" />
                    }
                  />


                  <Stat
                    title="UIF Employer"
                    value={
                      percentage(
                        rule.rules.uif.employer_rate
                      )
                    }
                    description={`Max ${money(
                      rule.rules.uif.max_employer_monthly
                    )} / month`}
                    icon={
                      <Landmark className="h-5 w-5" />
                    }
                  />


                  <Stat
                    title="SDL"
                    value={
                      percentage(
                        rule.rules.sdl.employer_rate
                      )
                    }
                    description={`Threshold ${money(
                      rule.rules.sdl.annual_remuneration_exemption_threshold
                    )}`}
                    icon={
                      <FileCheck2 className="h-5 w-5" />
                    }
                  />

                </div>


                <Panel
                  title="2027 PAYE Brackets"
                  description="Stored in the Nexus statutory rule engine, not hard-coded into payroll screens."
                >

                  <div className="overflow-x-auto">

                    <table className="w-full min-w-[700px] text-sm">

                      <thead>

                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">

                          <th className="p-3">
                            From
                          </th>

                          <th className="p-3">
                            To
                          </th>

                          <th className="p-3">
                            Base Tax
                          </th>

                          <th className="p-3">
                            Rate
                          </th>

                          <th className="p-3">
                            Above
                          </th>

                        </tr>

                      </thead>


                      <tbody>

                        {rule.rules.paye_brackets.map(
                          (
                            bracket,
                            index
                          ) => (
                            <tr
                              key={
                                index
                              }
                              className="border-b last:border-0"
                            >

                              <td className="p-3">
                                {money(
                                  bracket.from
                                )}
                              </td>


                              <td className="p-3">
                                {bracket.to !==
                                null
                                  ? money(
                                      bracket.to
                                    )
                                  : "No upper limit"}
                              </td>


                              <td className="p-3">
                                {money(
                                  bracket.base_tax
                                )}
                              </td>


                              <td className="p-3 font-semibold">
                                {percentage(
                                  bracket.rate
                                )}
                              </td>


                              <td className="p-3">
                                {money(
                                  bracket.over
                                )}
                              </td>

                            </tr>
                          )
                        )}

                      </tbody>

                    </table>

                  </div>

                </Panel>


                <div className="grid gap-5 xl:grid-cols-3">

                  <Panel title="Tax Rebates">

                    <DataLine
                      label="Primary"
                      value={
                        money(
                          rule.rules.rebates.primary
                        )
                      }
                    />

                    <DataLine
                      label="Secondary"
                      value={
                        money(
                          rule.rules.rebates.secondary
                        )
                      }
                    />

                    <DataLine
                      label="Tertiary"
                      value={
                        money(
                          rule.rules.rebates.tertiary
                        )
                      }
                    />

                  </Panel>


                  <Panel title="Tax Thresholds">

                    <DataLine
                      label="Under 65"
                      value={
                        money(
                          rule.rules.thresholds.under_65
                        )
                      }
                    />

                    <DataLine
                      label="Age 65–74"
                      value={
                        money(
                          rule.rules.thresholds.age_65_to_74
                        )
                      }
                    />

                    <DataLine
                      label="Age 75+"
                      value={
                        money(
                          rule.rules.thresholds.age_75_plus
                        )
                      }
                    />

                  </Panel>


                  <Panel title="Medical Tax Credits">

                    <DataLine
                      label="Taxpayer"
                      value={`${money(
                        rule.rules.medical_tax_credit_monthly.taxpayer
                      )} / month`}
                    />

                    <DataLine
                      label="First dependant"
                      value={`${money(
                        rule.rules.medical_tax_credit_monthly.first_dependent
                      )} / month`}
                    />

                    <DataLine
                      label="Additional dependant"
                      value={`${money(
                        rule.rules.medical_tax_credit_monthly.additional_dependent
                      )} / month`}
                    />

                  </Panel>

                </div>


                <Panel
                  title="Official Rule Source"
                  description="This version of the rule set remains attached to the tax year for auditability."
                >

                  <div className="flex items-start gap-3">

                    <LockKeyhole className="mt-1 h-5 w-5 text-muted-foreground" />


                    <div>

                      <p className="font-semibold">
                        {rule.source_title}
                      </p>


                      <a
                        href={
                          rule.source_url
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm underline"
                      >
                        Open statutory source
                      </a>


                      <p className="mt-3 text-sm text-muted-foreground">
                        {rule.rules.emp201_due_rule}
                      </p>

                    </div>

                  </div>

                </Panel>

              </div>
            ) : null}
          </>
        ) : null}


        {selectedEmployee ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">

            <div className="my-6 w-full max-w-3xl rounded-2xl bg-background shadow-xl">

              <div className="flex items-start justify-between border-b p-5">

                <div>

                  <h2 className="font-bold">
                    Employee Payroll Profile
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedEmployee.employee_name}
                    {" · "}
                    {selectedEmployee.employee_number}
                  </p>

                </div>


                <button
                  type="button"
                  onClick={
                    () =>
                      setSelectedEmployee(
                        null
                      )
                  }
                  className="rounded-lg p-2"
                >
                  <X className="h-5 w-5" />
                </button>

              </div>


              <div className="grid gap-5 p-5">

                <div className="grid gap-4 sm:grid-cols-2">

                  <Field label="Compensation type">

                    <select
                      value={
                        employeeForm.compensation_type
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            compensation_type:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="salaried">
                        Salaried
                      </option>

                      <option value="hourly">
                        Hourly
                      </option>
                    </select>

                  </Field>


                  <Field label="Pay frequency">

                    <select
                      value={
                        employeeForm.pay_frequency
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            pay_frequency:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="weekly">
                        Weekly
                      </option>

                      <option value="fortnightly">
                        Fortnightly
                      </option>

                      <option value="monthly">
                        Monthly
                      </option>
                    </select>

                  </Field>


                  {employeeForm.compensation_type ===
                  "salaried" ? (
                    <Field label="Monthly basic salary">

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          employeeForm.basic_salary_monthly
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,

                              basic_salary_monthly:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>
                  ) : (
                    <Field label="Hourly rate">

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          employeeForm.hourly_rate
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,

                              hourly_rate:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>
                  )}


                  <Field label="Income tax number">

                    <input
                      value={
                        employeeForm.tax_number
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            tax_number:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    />

                  </Field>


                  <Field label="Date of birth">

                    <input
                      type="date"
                      value={
                        employeeForm.birth_date
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            birth_date:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    />

                  </Field>


                  <Field label="Medical scheme dependants">

                    <input
                      type="number"
                      min="0"
                      value={
                        employeeForm.medical_scheme_dependants
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            medical_scheme_dependants:
                              event.target.value,
                          })
                      }
                      className={
                        inputClass
                      }
                    />

                  </Field>

                </div>


                <div className="grid gap-3 sm:grid-cols-3">

                  <label className="rounded-xl border p-4">

                    <input
                      type="checkbox"
                      checked={
                        employeeForm.paye_exempt
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            paye_exempt:
                              event.target.checked,
                          })
                      }
                    />

                    <p className="mt-2 font-semibold">
                      PAYE Exempt
                    </p>

                  </label>


                  <label className="rounded-xl border p-4">

                    <input
                      type="checkbox"
                      checked={
                        employeeForm.uif_exempt
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            uif_exempt:
                              event.target.checked,
                          })
                      }
                    />

                    <p className="mt-2 font-semibold">
                      UIF Exempt
                    </p>

                  </label>


                  <label className="rounded-xl border p-4">

                    <input
                      type="checkbox"
                      checked={
                        employeeForm.medical_scheme_main_member
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            medical_scheme_main_member:
                              event.target.checked,
                          })
                      }
                    />

                    <p className="mt-2 font-semibold">
                      Medical Scheme
                    </p>

                  </label>

                </div>


                {employeeForm.uif_exempt ? (
                  <Field label="UIF exemption reason">

                    <textarea
                      value={
                        employeeForm.uif_exemption_reason
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setEmployeeForm({
                            ...employeeForm,

                            uif_exemption_reason:
                              event.target.value,
                          })
                      }
                      className={
                        textareaClass
                      }
                    />

                  </Field>
                ) : null}


                {preview ? (
                  <div className="rounded-2xl border bg-muted/30 p-4">

                    <h3 className="font-semibold">
                      Statutory Preview
                    </h3>


                    <div className="mt-4 grid gap-3 sm:grid-cols-4">

                      <PreviewCard
                        label="Gross"
                        value={
                          money(
                            preview.gross_monthly
                          )
                        }
                      />


                      <PreviewCard
                        label="Employee UIF"
                        value={
                          money(
                            preview.uif_employee
                          )
                        }
                      />


                      <PreviewCard
                        label="Employer UIF"
                        value={
                          money(
                            preview.uif_employer
                          )
                        }
                      />


                      <PreviewCard
                        label="Employer SDL"
                        value={
                          money(
                            preview.sdl_employer
                          )
                        }
                      />

                    </div>


                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">

                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                      PAYE is deliberately not calculated by the 23.1 preview engine.

                    </div>

                  </div>
                ) : null}


                <div className="flex flex-wrap justify-end gap-2">

                  <button
                    type="button"
                    disabled={
                      busy ===
                      "preview"
                    }
                    onClick={
                      () =>
                        void previewContributions()
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
                  >
                    <Calculator className="h-4 w-4" />

                    Preview UIF / SDL
                  </button>


                  <button
                    type="button"
                    disabled={
                      busy ===
                      "employee"
                    }
                    onClick={
                      () =>
                        void saveEmployee()
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />

                    Save Payroll Profile
                  </button>

                </div>

              </div>

            </div>

          </div>
        ) : null}

      </main>

    </DashboardLayout>
  );
}


function ArchitectureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border p-4">

      <div className="flex gap-3">

        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />


        <div>

          <p className="font-semibold">
            {title}
          </p>


          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>

        </div>

      </div>

    </div>
  );
}


function DataLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0">

      <span className="text-sm text-muted-foreground">
        {label}
      </span>


      <span className="font-semibold">
        {value}
      </span>

    </div>
  );
}


function PreviewCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-3">

      <p className="text-xs text-muted-foreground">
        {label}
      </p>


      <p className="mt-1 font-bold">
        {value}
      </p>

    </div>
  );
}
