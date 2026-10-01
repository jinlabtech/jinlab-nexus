"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  RefreshCw,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type MoneyItem = {
  code: string;
  name: string;
  amount: number;
};

type EarningItem = MoneyItem & {
  quantity: number | null;
  rate: number | null;
  taxable: boolean | null;
};

type Payslip = {
  ok: boolean;

  document: {
    document_type: string;
    title: string;
    document_number: string;
    status: string;
    print_ready: boolean;
  };

  employer: {
    company_id: string;
    legal_name: string | null;
    trading_name: string | null;
    registration_number: string | null;
    email: string | null;
    phone: string | null;
    physical_address: string | null;
    website: string | null;
    country_code: string | null;
    currency: string | null;
    paye_reference: string | null;
    uif_reference: string | null;
    sdl_reference: string | null;
  };

  employee: {
    employee_id: string;
    employee_number: string | null;
    name: string;
    preferred_name: string | null;
    email: string | null;
    branch: string | null;
    department: string | null;
    position: string | null;
    employment_type: string | null;
    tax_number: string | null;
    pay_frequency: string | null;
  };

  period: {
    period_start: string;
    period_end: string;
    payment_date: string;
    tax_year: number;
  };

  summary: {
    gross_pay: number;
    taxable_remuneration: number;
    total_earnings: number;
    total_employee_deductions: number;
    net_pay: number;
  };

  statutory: {
    employee: {
      paye: number;
      uif: number;
      retirement: number;
      other_deductions: number;
    };

    employer: {
      uif: number;
      sdl: number;
      retirement: number;
    };
  };

  earnings: EarningItem[];
  deductions: MoneyItem[];
  employer_contributions: MoneyItem[];

  payroll: {
    pay_run_id: string;
    pay_run_employee_id: string;
    payroll_status: string;
    calculation_status: string;
    calculation_version: string | null;
  };
};

function money(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function humanCode(value: string | null | undefined) {
  if (!value) return "—";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-[7pt] font-bold uppercase tracking-[0.1em] text-gray-500">
        {label}
      </p>

      <p className="mt-[0.5mm] text-[9pt] font-semibold">
        {value || "—"}
      </p>
    </div>
  );
}

export default function PayrollPayslipPage() {
  const params = useParams();
  const router = useRouter();

  const payslipId = params.id as string;

  const [payslip, setPayslip] =
    useState<Payslip | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadPayslip() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          "get_payroll_payslip",
          {
            p_pay_run_employee_id:
              payslipId,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        if (!data) {
          throw new Error(
            "Payslip could not be loaded."
          );
        }

        setPayslip(data as Payslip);
      } catch (err) {
        console.error(
          "Payslip load failed:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Payslip could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    if (payslipId) {
      void loadPayslip();
    }
  }, [payslipId, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading payslip...
        </div>
      </main>
    );
  }

  if (error || !payslip) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-lg rounded-xl border bg-background p-6">
          <h1 className="text-lg font-bold">
            Payslip unavailable
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            {error ||
              "The payslip could not be loaded."}
          </p>

          <Button
            className="mt-5"
            variant="outline"
            onClick={() =>
              router.push("/payroll/runs")
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Payroll
          </Button>
        </div>
      </main>
    );
  }

  const currency =
    payslip.employer.currency || "ZAR";

  const employerName =
    payslip.employer.trading_name ||
    payslip.employer.legal_name ||
    "Company";

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .payslip-controls {
            display: none !important;
          }

          .nexus-payslip {
            width: 190mm !important;
            max-width: 190mm !important;
            min-height: 277mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }

          .avoid-break,
          .nexus-payslip tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .nexus-payslip * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <main className="min-h-screen bg-muted/30 px-4 py-6 print:bg-white print:p-0">
        <div className="payslip-controls mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() =>
              router.push("/payroll/runs")
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Payroll
          </Button>

          <Button
            onClick={() =>
              window.print()
            }
          >
            <Printer className="mr-2 h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>

        <article className="nexus-payslip mx-auto min-h-[297mm] w-[210mm] bg-white p-[10mm] text-black shadow-sm">
          <header className="avoid-break border-b-2 border-black pb-[5mm]">
            <div className="flex items-start justify-between gap-[10mm]">
              <div className="min-w-0 flex-1">
                <p className="text-[18pt] font-black tracking-[0.08em]">
                  {employerName}
                </p>

                {payslip.employer.legal_name &&
                  payslip.employer.legal_name !==
                    employerName && (
                    <p className="mt-[1mm] text-[8pt] font-semibold text-gray-600">
                      {
                        payslip.employer
                          .legal_name
                      }
                    </p>
                  )}

                <div className="mt-[3mm] space-y-[0.6mm] text-[8pt] leading-[1.4] text-gray-600">
                  {payslip.employer
                    .registration_number && (
                    <p>
                      Registration:{" "}
                      {
                        payslip.employer
                          .registration_number
                      }
                    </p>
                  )}

                  {payslip.employer
                    .physical_address && (
                    <p className="whitespace-pre-line">
                      {
                        payslip.employer
                          .physical_address
                      }
                    </p>
                  )}

                  {payslip.employer
                    .phone && (
                    <p>
                      {
                        payslip.employer
                          .phone
                      }
                    </p>
                  )}

                  {payslip.employer
                    .email && (
                    <p>
                      {
                        payslip.employer
                          .email
                      }
                    </p>
                  )}
                </div>
              </div>

              <div className="w-[72mm] shrink-0 text-right">
                <h1 className="text-[27pt] font-light leading-none tracking-[-0.03em]">
                  PAYSLIP
                </h1>

                <p className="mt-[2mm] text-[9pt] font-black">
                  {
                    payslip.document
                      .document_number
                  }
                </p>

                <div className="mt-[3mm] border-y border-black py-[2mm]">
                  <p className="text-[7pt] font-bold uppercase tracking-[0.12em]">
                    Net Pay
                  </p>

                  <p className="mt-[0.8mm] text-[18pt] font-black leading-none">
                    {money(
                      payslip.summary
                        .net_pay,
                      currency
                    )}
                  </p>
                </div>

                <p className="mt-[2mm] text-[7.5pt] font-bold uppercase tracking-[0.1em]">
                  {humanCode(
                    payslip.document.status
                  )}
                </p>
              </div>
            </div>
          </header>

          <section className="avoid-break mt-[6mm] grid grid-cols-2 gap-[8mm]">
            <div>
              <h2 className="border-b border-black pb-[1.5mm] text-[8pt] font-black uppercase tracking-[0.12em]">
                Employee
              </h2>

              <div className="mt-[3mm] grid grid-cols-2 gap-x-[5mm] gap-y-[3mm]">
                <Detail
                  label="Employee Name"
                  value={
                    payslip.employee.name
                  }
                />

                <Detail
                  label="Employee Number"
                  value={
                    payslip.employee
                      .employee_number
                  }
                />

                <Detail
                  label="Position"
                  value={
                    payslip.employee
                      .position
                  }
                />

                <Detail
                  label="Department"
                  value={
                    payslip.employee
                      .department
                  }
                />

                <Detail
                  label="Branch"
                  value={
                    payslip.employee.branch
                  }
                />

                <Detail
                  label="Employment"
                  value={humanCode(
                    payslip.employee
                      .employment_type
                  )}
                />

                <Detail
                  label="Tax Number"
                  value={
                    payslip.employee
                      .tax_number
                  }
                />

                <Detail
                  label="Pay Frequency"
                  value={humanCode(
                    payslip.employee
                      .pay_frequency
                  )}
                />
              </div>
            </div>

            <div>
              <h2 className="border-b border-black pb-[1.5mm] text-[8pt] font-black uppercase tracking-[0.12em]">
                Pay Period
              </h2>

              <div className="mt-[3mm] grid grid-cols-2 gap-x-[5mm] gap-y-[3mm]">
                <Detail
                  label="Period Start"
                  value={formatDate(
                    payslip.period
                      .period_start
                  )}
                />

                <Detail
                  label="Period End"
                  value={formatDate(
                    payslip.period
                      .period_end
                  )}
                />

                <Detail
                  label="Payment Date"
                  value={formatDate(
                    payslip.period
                      .payment_date
                  )}
                />

                <Detail
                  label="Tax Year"
                  value={
                    payslip.period.tax_year
                  }
                />

                <Detail
                  label="Payroll Status"
                  value={humanCode(
                    payslip.payroll
                      .payroll_status
                  )}
                />

                <Detail
                  label="Calculation"
                  value={humanCode(
                    payslip.payroll
                      .calculation_status
                  )}
                />
              </div>
            </div>
          </section>

          <section className="mt-[7mm]">
            <h2 className="border-b-2 border-black pb-[1.5mm] text-[9pt] font-black uppercase tracking-[0.12em]">
              Earnings
            </h2>

            <table className="mt-[2mm] w-full border-collapse text-[8.5pt]">
              <thead>
                <tr className="border-b border-gray-400 text-left text-[7pt] uppercase tracking-[0.08em] text-gray-500">
                  <th className="py-[1.5mm]">
                    Description
                  </th>

                  <th className="py-[1.5mm] text-right">
                    Qty
                  </th>

                  <th className="py-[1.5mm] text-right">
                    Rate
                  </th>

                  <th className="py-[1.5mm] text-right">
                    Amount
                  </th>
                </tr>
              </thead>

              <tbody>
                {payslip.earnings.length >
                0 ? (
                  payslip.earnings.map(
                    (item, index) => (
                      <tr
                        key={`${item.code}-${index}`}
                        className="border-b border-gray-200"
                      >
                        <td className="py-[2mm] font-medium">
                          {item.name}
                        </td>

                        <td className="py-[2mm] text-right">
                          {item.quantity ??
                            "—"}
                        </td>

                        <td className="py-[2mm] text-right">
                          {item.rate != null
                            ? money(
                                item.rate,
                                currency
                              )
                            : "—"}
                        </td>

                        <td className="py-[2mm] text-right font-semibold">
                          {money(
                            item.amount,
                            currency
                          )}
                        </td>
                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-[3mm] text-gray-500"
                    >
                      No itemised earnings.
                    </td>
                  </tr>
                )}
              </tbody>

              <tfoot>
                <tr>
                  <td
                    colSpan={3}
                    className="pt-[2.5mm] text-right text-[8pt] font-black uppercase"
                  >
                    Gross Pay
                  </td>

                  <td className="pt-[2.5mm] text-right text-[10pt] font-black">
                    {money(
                      payslip.summary
                        .gross_pay,
                      currency
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="mt-[7mm] grid grid-cols-2 gap-[8mm]">
            <div>
              <h2 className="border-b-2 border-black pb-[1.5mm] text-[9pt] font-black uppercase tracking-[0.12em]">
                Deductions
              </h2>

              <table className="mt-[2mm] w-full text-[8.5pt]">
                <tbody>
                  {payslip.deductions.map(
                    (item, index) => (
                      <tr
                        key={`${item.code}-${index}`}
                        className="border-b border-gray-200"
                      >
                        <td className="py-[1.7mm]">
                          {item.name}
                        </td>

                        <td className="py-[1.7mm] text-right font-semibold">
                          {money(
                            item.amount,
                            currency
                          )}
                        </td>
                      </tr>
                    )
                  )}

                  {payslip.deductions
                    .length === 0 && (
                    <tr>
                      <td className="py-[2mm] text-gray-500">
                        No deductions.
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot>
                  <tr>
                    <td className="pt-[2.5mm] font-black uppercase">
                      Total Deductions
                    </td>

                    <td className="pt-[2.5mm] text-right font-black">
                      {money(
                        payslip.summary
                          .total_employee_deductions,
                        currency
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div>
              <h2 className="border-b-2 border-black pb-[1.5mm] text-[9pt] font-black uppercase tracking-[0.12em]">
                Statutory Summary
              </h2>

              <table className="mt-[2mm] w-full text-[8.5pt]">
                <tbody>
                  <tr className="border-b border-gray-200">
                    <td className="py-[1.7mm]">
                      PAYE
                    </td>
                    <td className="py-[1.7mm] text-right font-semibold">
                      {money(
                        payslip.statutory
                          .employee.paye,
                        currency
                      )}
                    </td>
                  </tr>

                  <tr className="border-b border-gray-200">
                    <td className="py-[1.7mm]">
                      UIF — Employee
                    </td>
                    <td className="py-[1.7mm] text-right font-semibold">
                      {money(
                        payslip.statutory
                          .employee.uif,
                        currency
                      )}
                    </td>
                  </tr>

                  <tr className="border-b border-gray-200">
                    <td className="py-[1.7mm]">
                      Retirement — Employee
                    </td>
                    <td className="py-[1.7mm] text-right font-semibold">
                      {money(
                        payslip.statutory
                          .employee
                          .retirement,
                        currency
                      )}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-[1.7mm]">
                      Taxable Remuneration
                    </td>
                    <td className="py-[1.7mm] text-right font-semibold">
                      {money(
                        payslip.summary
                          .taxable_remuneration,
                        currency
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {payslip
            .employer_contributions
            .length > 0 && (
            <section className="avoid-break mt-[7mm]">
              <h2 className="border-b border-black pb-[1.5mm] text-[8pt] font-black uppercase tracking-[0.12em]">
                Employer Contributions
              </h2>

              <div className="mt-[2mm] grid grid-cols-3 gap-[3mm]">
                {payslip.employer_contributions.map(
                  (item, index) => (
                    <div
                      key={`${item.code}-${index}`}
                      className="border p-[2.5mm]"
                    >
                      <p className="text-[7pt] uppercase text-gray-500">
                        {item.name}
                      </p>

                      <p className="mt-[1mm] text-[9pt] font-black">
                        {money(
                          item.amount,
                          currency
                        )}
                      </p>
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          <section className="avoid-break mt-[8mm] border-y-2 border-black py-[4mm]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[8pt] font-black uppercase tracking-[0.14em]">
                  Net Pay
                </p>

                <p className="mt-[1mm] text-[7.5pt] text-gray-500">
                  Amount payable to employee
                </p>
              </div>

              <p className="text-[20pt] font-black">
                {money(
                  payslip.summary.net_pay,
                  currency
                )}
              </p>
            </div>
          </section>

          <footer className="mt-auto pt-[8mm] text-[7pt] leading-[1.4] text-gray-500">
            <div className="border-t pt-[3mm]">
              <div className="flex justify-between gap-[5mm]">
                <div>
                  <p>
                    Payroll calculation:{" "}
                    {payslip.payroll
                      .calculation_version ||
                      "Nexus Payroll"}
                  </p>

                  <p>
                    Document:{" "}
                    {
                      payslip.document
                        .document_number
                    }
                  </p>
                </div>

                <div className="text-right">
                  <p>
                    Generated from JINLAB Nexus
                  </p>

                  <p>
                    Keep this payslip for your
                    records.
                  </p>
                </div>
              </div>
            </div>
          </footer>
        </article>
      </main>
    </>
  );
}
