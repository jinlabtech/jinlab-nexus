export type NexusToolContext = {
  supabaseUrl: string;
  supabaseKey: string;
  authorization: string;
};

type ToolArguments = Record<string, unknown>;

export const NEXUS_READ_TOOLS = [
  {
    type: "function",
    name: "search_nexus",
    description:
      "Search across Nexus for a customer, repair Job Card, device, invoice, inventory item or employee. Use this first when the owner refers to a name, number, product, device or record that needs to be identified.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "The name, number, device, item or phrase to search for.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_accounting_intelligence",
    description:
      "Get deeper accounting and financial-control intelligence including KPIs, accounting health, profitability indicators and control exceptions. Use when analysing financial performance, margins, cash-flow pressure or accounting health.",
    parameters: {
      type: "object",
      properties: {
        as_of_date: {
          type: ["string", "null"],
          description: "YYYY-MM-DD or null for today.",
        },
        branch_id: {
          type: ["string", "null"],
          description: "Optional branch UUID.",
        },
      },
      required: ["as_of_date", "branch_id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_pos_intelligence",
    description:
      "Analyse recent point-of-sale performance, transaction activity and sales behaviour. Use for revenue momentum, shop activity, selling patterns and POS performance.",
    parameters: {
      type: "object",
      properties: {
        branch_id: {
          type: ["string", "null"],
          description: "Optional branch UUID.",
        },
        days: {
          type: "integer",
          minimum: 1,
          maximum: 90,
        },
      },
      required: ["branch_id", "days"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_cashup_intelligence",
    description:
      "Inspect POS till and cash-up controls. Use when investigating cash handling, till differences, operational cash risk or cashier controls.",
    parameters: {
      type: "object",
      properties: {
        branch_id: {
          type: ["string", "null"],
          description: "Optional branch UUID.",
        },
      },
      required: ["branch_id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_inventory_intelligence",
    description:
      "Get inventory tracking intelligence including stock-control information and movement readiness. Use for stock shortages, slow stock, inventory control, purchasing needs and operational stock risk.",
    parameters: {
      type: "object",
      properties: {
        branch_id: {
          type: ["string", "null"],
          description: "Optional branch UUID.",
        },
      },
      required: ["branch_id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_hr_timebook",
    description:
      "Read and analyse Nexus Time Book data including attendance, clock-ins, clock-outs, late days, absences, worked minutes, scheduled minutes and linked sales activity.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 30,
        },
        branch_id: {
          type: ["string", "null"],
        },
        employee_id: {
          type: ["string", "null"],
        },
      },
      required: ["days", "branch_id", "employee_id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_hr_intelligence",
    description:
      "Get operational HR intelligence including attendance, workforce issues and current people-management signals. Use when analysing staffing, attendance, productivity or operational workforce risk.",
    parameters: {
      type: "object",
      properties: {
        branch_id: {
          type: ["string", "null"],
          description: "Optional branch UUID.",
        },
        days: {
          type: "integer",
          minimum: 1,
          maximum: 30,
        },
      },
      required: ["branch_id", "days"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_supplier_payables",
    description:
      "Get supplier amounts owed and payables information. Use when analysing upcoming obligations, supplier pressure, purchasing liabilities or cash requirements.",
    parameters: {
      type: "object",
      properties: {
        as_of_date: {
          type: ["string", "null"],
          description: "YYYY-MM-DD or null for today.",
        },
      },
      required: ["as_of_date"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_payroll_intelligence",
    description:
      "Get payroll foundation and payroll readiness information. Use when analysing payroll setup, employee pay structure, payroll risk or salary obligations.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_accounting_exceptions",
    description:
      "Get accounting exceptions and control failures requiring attention. Use when checking whether Nexus accounting is healthy, balanced and operating correctly.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_business_overview",
    description:
      "Get the current high-level JINLAB business overview including sales, receivables, repairs, inventory, people and finance controls. Use this for broad owner questions.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_repairs",
    description:
      "Search current JINLAB repair Job Cards. Use this when the owner asks about repairs, devices, technicians, repair status, customers or Job Cards.",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: ["string", "null"],
          description:
            "Optional search for Job Card number, customer, device, brand, model, serial, IMEI or fault.",
        },
        status: {
          type: ["string", "null"],
          description:
            "Optional repair status such as received, diagnosing, awaiting_approval, approved, in_progress, ready_for_collection, collected or closed.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum number of Job Cards to return.",
        },
      },
      required: ["search", "status", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_debtor_risk",
    description:
      "Get current debtor and customer payment risk information. Use this for overdue invoices, collections, credit risk and cash collection questions.",
    parameters: {
      type: "object",
      properties: {
        as_of_date: {
          type: ["string", "null"],
          description:
            "Optional date in YYYY-MM-DD format. Null means today's date.",
        },
      },
      required: ["as_of_date"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_debtor_ageing",
    description:
      "Get accounts receivable ageing information. Use when the owner asks which debts are old, overdue or should be collected first.",
    parameters: {
      type: "object",
      properties: {
        as_of_date: {
          type: ["string", "null"],
          description:
            "Optional date in YYYY-MM-DD format. Null means today's date.",
        },
      },
      required: ["as_of_date"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_inventory_readiness",
    description:
      "Check JINLAB inventory costing and stock readiness. Use this when investigating inventory value, costing reliability or stock-control readiness.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "search_inventory",
    description:
      "Search active JINLAB inventory using item name, SKU or barcode. Use when asked about a specific product, part or stock item.",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: "string",
          minLength: 1,
          description: "Item name, SKU, barcode or search phrase.",
        },
        branch_id: {
          type: ["string", "null"],
          description:
            "Optional Nexus branch UUID. Use null when no branch was specified.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
        },
      },
      required: ["search", "branch_id", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "get_hr_attendance_issues",
    description:
      "Get recent unresolved employee attendance exceptions. Use for lateness, missed attendance, timekeeping or workforce-control questions.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
        },
      },
      required: ["limit"],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;

function johannesburgDate() {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function johannesburgDateDaysAgo(days: number) {
  const date = new Date(
    Date.now() - Math.max(days, 0) * 86400000
  );

  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function rpc(
  name: string,
  args: ToolArguments,
  context: NexusToolContext
) {
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: context.supabaseKey,
        Authorization: context.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    }
  );

  const text = await response.text();

  if (!response.ok) {
    console.error(`Nexus tool ${name} failed:`, response.status, text);

    throw new Error(`Nexus could not access ${name}.`);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rest(
  path: string,
  context: NexusToolContext
) {
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/${path}`,
    {
      headers: {
        apikey: context.supabaseKey,
        Authorization: context.authorization,
      },
      cache: "no-store",
    }
  );

  const text = await response.text();

  if (!response.ok) {
    console.error("Nexus REST tool failed:", response.status, text);
    throw new Error("Nexus could not access the requested information.");
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function executeNexusTool(
  name: string,
  rawArguments: unknown,
  context: NexusToolContext
) {
  const args =
    rawArguments &&
    typeof rawArguments === "object" &&
    !Array.isArray(rawArguments)
      ? (rawArguments as ToolArguments)
      : {};

  switch (name) {
    case "search_nexus":
      return rpc(
        "nexus_ai_search",
        {
          p_query:
            typeof args.query === "string"
              ? args.query.slice(0, 250)
              : "",
          p_limit:
            typeof args.limit === "number"
              ? Math.min(Math.max(args.limit, 1), 20)
              : 8,
        },
        context
      );

    case "get_accounting_intelligence":
      return rpc(
        "get_accounting_kpi_dashboard",
        {
          p_as_of_date:
            typeof args.as_of_date === "string"
              ? args.as_of_date
              : johannesburgDate(),
          p_branch_id:
            typeof args.branch_id === "string"
              ? args.branch_id
              : null,
        },
        context
      );

    case "get_pos_intelligence":
      return rpc(
        "get_pos_analytics_workspace",
        {
          p_branch_id:
            typeof args.branch_id === "string"
              ? args.branch_id
              : null,
          p_days:
            typeof args.days === "number"
              ? Math.min(Math.max(args.days, 1), 90)
              : 30,
        },
        context
      );

    case "get_cashup_intelligence":
      return rpc(
        "get_pos_cashup_workspace",
        {
          p_branch_id:
            typeof args.branch_id === "string"
              ? args.branch_id
              : null,
        },
        context
      );

    case "get_inventory_intelligence":
      return rpc(
        "get_inventory_tracking_workspace",
        {
          p_branch_id:
            typeof args.branch_id === "string"
              ? args.branch_id
              : null,
        },
        context
      );

    case "get_hr_timebook": {
      const days =
        typeof args.days === "number"
          ? Math.min(Math.max(args.days, 1), 30)
          : 7;

      return rpc(
        "get_hr_timebook_workspace",
        {
          p_branch_id:
            typeof args.branch_id === "string"
              ? args.branch_id
              : null,
          p_start_date:
            johannesburgDateDaysAgo(days - 1),
          p_end_date:
            johannesburgDate(),
          p_employee_id:
            typeof args.employee_id === "string"
              ? args.employee_id
              : null,
        },
        context
      );
    }

    case "get_hr_intelligence":
      return rpc(
        "get_hr_intelligence_workspace",
        {
          p_branch_id:
            typeof args.branch_id === "string"
              ? args.branch_id
              : null,
          p_days:
            typeof args.days === "number"
              ? Math.min(Math.max(args.days, 1), 30)
              : 7,
        },
        context
      );

    case "get_supplier_payables":
      return rpc(
        "get_supplier_payables_workspace",
        {
          p_as_of_date:
            typeof args.as_of_date === "string"
              ? args.as_of_date
              : johannesburgDate(),
        },
        context
      );

    case "get_payroll_intelligence":
      return rpc(
        "get_payroll_foundation_workspace",
        {},
        context
      );

    case "get_accounting_exceptions":
      return rpc(
        "get_accounting_exception_summary",
        {},
        context
      );

    case "get_business_overview":
      return rpc("get_nexus_cto_snapshot", {}, context);

    case "get_repairs":
      return rpc(
        "get_service_job_queue",
        {
          p_search:
            typeof args.search === "string"
              ? args.search
              : null,
          p_status:
            typeof args.status === "string"
              ? args.status
              : null,
          p_limit:
            typeof args.limit === "number"
              ? Math.min(Math.max(args.limit, 1), 50)
              : 20,
        },
        context
      );

    case "get_debtor_risk":
      return rpc(
        "get_debtor_risk_summary",
        {
          p_as_of_date:
            typeof args.as_of_date === "string"
              ? args.as_of_date
              : johannesburgDate(),
        },
        context
      );

    case "get_debtor_ageing":
      return rpc(
        "get_debtor_ageing",
        {
          p_as_of_date:
            typeof args.as_of_date === "string"
              ? args.as_of_date
              : johannesburgDate(),
        },
        context
      );

    case "get_inventory_readiness":
      return rpc(
        "get_inventory_costing_readiness",
        {},
        context
      );

    case "search_inventory":
      return rpc(
        "search_inventory_barcodes",
        {
          p_search:
            typeof args.search === "string"
              ? args.search.slice(0, 200)
              : "",
          p_branch_id:
            typeof args.branch_id === "string"
              ? args.branch_id
              : null,
          p_limit:
            typeof args.limit === "number"
              ? Math.min(Math.max(args.limit, 1), 30)
              : 10,
        },
        context
      );

    case "get_hr_attendance_issues":
      return rpc(
        "get_hr_intelligence_workspace",
        {
          p_branch_id: null,
          p_days: 30,
        },
        context
      );

    default:
      throw new Error(`Unknown Nexus tool: ${name}`);
  }
}
