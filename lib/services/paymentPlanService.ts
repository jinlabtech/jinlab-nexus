import { supabase } from "@/lib/supabase";

export type PaymentPlanType =
  | "layby"
  | "instalment"
  | "account";

export type PaymentPlanStatus =
  | "draft"
  | "active"
  | "completed"
  | "cancelled"
  | "defaulted";

export type PaymentFrequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "custom";

export type InstallmentStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type InvoicePaymentPlan = {
  id: string;
  company_id: string;
  branch_id: string;
  invoice_id: string;
  customer_id: string;

  plan_type: PaymentPlanType;
  status: PaymentPlanStatus;

  total_amount: number;
  deposit_amount: number;
  instalment_amount: number | null;

  frequency: PaymentFrequency | null;

  start_date: string;
  next_payment_date: string | null;
  expected_completion_date: string | null;

  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentPlanInstallment = {
  id: string;
  payment_plan_id: string;
  company_id: string;
  invoice_id: string;

  installment_number: number;
  due_date: string;

  amount_due: number;
  amount_paid: number;

  status: InstallmentStatus;

  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatePaymentPlanInput = {
  company_id: string;
  branch_id: string;
  invoice_id: string;
  customer_id: string;

  plan_type: PaymentPlanType;

  total_amount: number;
  deposit_amount: number;
  instalment_amount: number;

  frequency: PaymentFrequency;

  start_date: string;
  first_payment_date: string;
  expected_completion_date?: string | null;

  notes?: string;
};

function addFrequency(
  date: Date,
  frequency: PaymentFrequency
) {
  const next = new Date(date);

  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;

    case "fortnightly":
      next.setDate(next.getDate() + 14);
      break;

    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;

    case "custom":
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return next;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function calculateInstallmentCount(
  totalAmount: number,
  depositAmount: number,
  installmentAmount: number
) {
  const remaining =
    Math.max(totalAmount - depositAmount, 0);

  if (
    remaining <= 0 ||
    installmentAmount <= 0
  ) {
    return 0;
  }

  return Math.ceil(
    remaining / installmentAmount
  );
}

export function calculateExpectedCompletionDate(
  totalAmount: number,
  depositAmount: number,
  installmentAmount: number,
  frequency: PaymentFrequency,
  firstPaymentDate: string
) {
  const count =
    calculateInstallmentCount(
      totalAmount,
      depositAmount,
      installmentAmount
    );

  if (count <= 0) {
    return firstPaymentDate;
  }

  let date =
    new Date(
      `${firstPaymentDate}T12:00:00`
    );

  for (
    let index = 1;
    index < count;
    index += 1
  ) {
    date =
      addFrequency(
        date,
        frequency
      );
  }

  return dateOnly(date);
}

export async function getInvoicePaymentPlan(
  invoiceId: string,
  companyId: string
): Promise<InvoicePaymentPlan | null> {
  const { data, error } =
    await supabase
      .from("invoice_payment_plan")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("company_id", companyId)
      .in("status", [
        "draft",
        "active",
        "completed",
      ])
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as
    | InvoicePaymentPlan
    | null;
}

export async function getPaymentPlanInstallments(
  paymentPlanId: string,
  companyId: string
): Promise<PaymentPlanInstallment[]> {
  const { data, error } =
    await supabase
      .from(
        "invoice_payment_plan_installment"
      )
      .select("*")
      .eq(
        "payment_plan_id",
        paymentPlanId
      )
      .eq(
        "company_id",
        companyId
      )
      .order(
        "installment_number",
        {
          ascending: true,
        }
      );

  if (error) {
    throw new Error(error.message);
  }

  return (
    data ?? []
  ) as PaymentPlanInstallment[];
}

export async function createPaymentPlan(
  input: CreatePaymentPlanInput
): Promise<InvoicePaymentPlan> {
  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      "You must be logged in to create a payment plan."
    );
  }

  if (input.total_amount <= 0) {
    throw new Error(
      "Invoice total must be greater than zero."
    );
  }

  if (
    input.deposit_amount < 0 ||
    input.deposit_amount >
      input.total_amount
  ) {
    throw new Error(
      "Deposit amount is invalid."
    );
  }

  const remaining =
    input.total_amount -
    input.deposit_amount;

  if (
    remaining > 0 &&
    input.instalment_amount <= 0
  ) {
    throw new Error(
      "Instalment amount must be greater than zero."
    );
  }

  const completionDate =
    input.expected_completion_date ||
    calculateExpectedCompletionDate(
      input.total_amount,
      input.deposit_amount,
      input.instalment_amount,
      input.frequency,
      input.first_payment_date
    );

  const { data: plan, error } =
    await supabase
      .from("invoice_payment_plan")
      .insert({
        company_id:
          input.company_id,
        branch_id:
          input.branch_id,
        invoice_id:
          input.invoice_id,
        customer_id:
          input.customer_id,

        plan_type:
          input.plan_type,
        status: "active",

        total_amount:
          input.total_amount,
        deposit_amount:
          input.deposit_amount,
        instalment_amount:
          input.instalment_amount,

        frequency:
          input.frequency,

        start_date:
          input.start_date,
        next_payment_date:
          remaining > 0
            ? input.first_payment_date
            : null,

        expected_completion_date:
          completionDate,

        notes:
          input.notes?.trim() ||
          null,

        created_by:
          user.id,
      })
      .select("*")
      .single();

  if (error || !plan) {
    throw new Error(
      error?.message ||
        "Payment plan could not be created."
    );
  }

  const installmentCount =
    calculateInstallmentCount(
      input.total_amount,
      input.deposit_amount,
      input.instalment_amount
    );

  if (installmentCount > 0) {
    const schedule = [];

    let dueDate =
      new Date(
        `${input.first_payment_date}T12:00:00`
      );

    let amountRemaining =
      remaining;

    for (
      let index = 1;
      index <= installmentCount;
      index += 1
    ) {
      const amountDue =
        Math.min(
          input.instalment_amount,
          amountRemaining
        );

      schedule.push({
        payment_plan_id:
          plan.id,
        company_id:
          input.company_id,
        invoice_id:
          input.invoice_id,

        installment_number:
          index,

        due_date:
          dateOnly(dueDate),

        amount_due:
          Number(
            amountDue.toFixed(2)
          ),

        amount_paid: 0,
        status: "pending",
      });

      amountRemaining -=
        amountDue;

      dueDate =
        addFrequency(
          dueDate,
          input.frequency
        );
    }

    const {
      error: scheduleError,
    } =
      await supabase
        .from(
          "invoice_payment_plan_installment"
        )
        .insert(schedule);

    if (scheduleError) {
      /*
       * Don't leave an active plan
       * without its schedule.
       */
      await supabase
        .from(
          "invoice_payment_plan"
        )
        .delete()
        .eq("id", plan.id);

      throw new Error(
        scheduleError.message
      );
    }
  }

  return plan as InvoicePaymentPlan;
}

export type PaymentPlanProgress = {
  total_installments: number;
  paid_installments: number;
  partially_paid_installments: number;
  outstanding_installments: number;
  overdue_installments: number;

  total_scheduled: number;
  total_installment_paid: number;
  overdue_amount: number;

  next_installment: PaymentPlanInstallment | null;
  next_payment_date: string | null;
  next_amount_due: number;

  progress_percentage: number;
};

export function calculatePaymentPlanProgress(
  installments: PaymentPlanInstallment[]
): PaymentPlanProgress {
  const today =
    new Date().toISOString().slice(0, 10);

  const totalInstallments =
    installments.length;

  const paidInstallments =
    installments.filter(
      (item) =>
        item.status === "paid" ||
        Number(item.amount_paid) >=
          Number(item.amount_due)
    ).length;

  const partiallyPaidInstallments =
    installments.filter(
      (item) =>
        item.status === "partially_paid" ||
        (
          Number(item.amount_paid) > 0 &&
          Number(item.amount_paid) <
            Number(item.amount_due)
        )
    ).length;

  const outstanding =
    installments.filter(
      (item) =>
        item.status !== "paid" &&
        item.status !== "cancelled" &&
        Number(item.amount_paid) <
          Number(item.amount_due)
    );

  const overdue =
    outstanding.filter(
      (item) =>
        item.due_date < today
    );

  const totalScheduled =
    installments.reduce(
      (sum, item) =>
        sum + Number(item.amount_due),
      0
    );

  const totalPaid =
    installments.reduce(
      (sum, item) =>
        sum + Number(item.amount_paid),
      0
    );

  const overdueAmount =
    overdue.reduce(
      (sum, item) =>
        sum +
        Math.max(
          Number(item.amount_due) -
            Number(item.amount_paid),
          0
        ),
      0
    );

  const nextInstallment =
    outstanding
      .slice()
      .sort(
        (a, b) =>
          a.due_date.localeCompare(
            b.due_date
          )
      )[0] ?? null;

  const nextAmountDue =
    nextInstallment
      ? Math.max(
          Number(
            nextInstallment.amount_due
          ) -
            Number(
              nextInstallment.amount_paid
            ),
          0
        )
      : 0;

  const progressPercentage =
    totalScheduled > 0
      ? Math.min(
          100,
          Math.round(
            (totalPaid /
              totalScheduled) *
              100
          )
        )
      : 0;

  return {
    total_installments:
      totalInstallments,
    paid_installments:
      paidInstallments,
    partially_paid_installments:
      partiallyPaidInstallments,
    outstanding_installments:
      outstanding.length,
    overdue_installments:
      overdue.length,

    total_scheduled:
      totalScheduled,
    total_installment_paid:
      totalPaid,
    overdue_amount:
      overdueAmount,

    next_installment:
      nextInstallment,
    next_payment_date:
      nextInstallment?.due_date ??
      null,
    next_amount_due:
      nextAmountDue,

    progress_percentage:
      progressPercentage,
  };
}
