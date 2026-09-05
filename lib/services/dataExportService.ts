import JSZip from "jszip";

import { supabase } from "@/lib/supabase";


export type ExportType =
  | "business_data"
  | "full_backup"
  | "migration_package";

export type ExportJobStatus =
  | "requested"
  | "processing"
  | "completed"
  | "failed"
  | "expired";


export type CompanyExportJob = {
  id: string;
  company_id: string;
  requested_by: string;
  export_type: ExportType;
  export_format: string;
  status: ExportJobStatus;
  include_documents: boolean;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  file_size_bytes: number | null;
  checksum_sha256: string | null;
  error_message: string | null;
  schema_version: string;
};


type GenericRow =
  Record<string, unknown>;


type ExportTableDefinition = {
  table: string;
  folder: string;
  filename: string;
};


const DIRECT_COMPANY_TABLES: ExportTableDefinition[] = [
  {
    table: "branch",
    folder: "organisation",
    filename: "branches",
  },
  {
    table: "user_profile",
    folder: "organisation",
    filename: "users",
  },

  {
    table: "customer",
    folder: "customers",
    filename: "customers",
  },

  {
    table: "supplier",
    folder: "purchasing",
    filename: "suppliers",
  },
  {
    table: "purchase_order",
    folder: "purchasing",
    filename: "purchase-orders",
  },
  {
    table: "purchase_order_item",
    folder: "purchasing",
    filename: "purchase-order-items",
  },
  {
    table: "purchase_receipt",
    folder: "purchasing",
    filename: "purchase-receipts",
  },
  {
    table: "purchase_receipt_item",
    folder: "purchasing",
    filename: "purchase-receipt-items",
  },

  {
    table: "inventory_category",
    folder: "inventory",
    filename: "categories",
  },
  {
    table: "inventory_item",
    folder: "inventory",
    filename: "items",
  },
  {
    table: "branch_stock",
    folder: "inventory",
    filename: "branch-stock",
  },
  {
    table: "stock_movement",
    folder: "inventory",
    filename: "stock-movements",
  },

  {
    table: "quotation",
    folder: "sales",
    filename: "quotations",
  },
  {
    table: "quotation_item",
    folder: "sales",
    filename: "quotation-items",
  },
  {
    table: "sales_order",
    folder: "sales",
    filename: "sales-orders",
  },
  {
    table: "invoice",
    folder: "sales",
    filename: "invoices",
  },
  {
    table: "invoice_item",
    folder: "sales",
    filename: "invoice-items",
  },
  {
    table: "invoice_payment",
    folder: "sales",
    filename: "invoice-payments",
  },
];


const SETTINGS_TABLES: ExportTableDefinition[] = [
  {
    table: "company_profile_settings",
    folder: "settings",
    filename: "company-profile",
  },
  {
    table: "company_document_settings",
    folder: "settings",
    filename: "document-settings",
  },
  {
    table: "company_finance_settings",
    folder: "settings",
    filename: "finance-settings",
  },
  {
    table: "company_accounting_settings",
    folder: "settings",
    filename: "accounting-settings",
  },
  {
    table: "company_branch_settings",
    folder: "settings",
    filename: "branch-settings",
  },
  {
    table: "company_security_settings",
    folder: "settings",
    filename: "security-settings",
  },
  {
    table: "company_bank_account",
    folder: "settings",
    filename: "bank-accounts",
  },
];


const GOVERNANCE_TABLES: ExportTableDefinition[] = [
  {
    table: "audit_log",
    folder: "governance",
    filename: "audit-log",
  },
  {
    table: "settings_change_log",
    folder: "governance",
    filename: "settings-change-log",
  },
];


async function getCurrentCompanyId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "You must be signed in to export company data."
    );
  }


  const {
    data,
    error,
  } = await supabase
    .from("user_profile")
    .select("company_id")
    .eq("user_id", user.id)
    .single();


  if (error) {
    throw new Error(error.message);
  }


  if (!data?.company_id) {
    throw new Error(
      "Your account is not linked to a company."
    );
  }


  return data.company_id;
}


async function getCompanyRow(
  companyId: string
): Promise<GenericRow | null> {
  const {
    data,
    error,
  } = await supabase
    .from("company")
    .select("*")
    .eq("id", companyId)
    .single();


  if (error) {
    throw new Error(
      `Could not export company record: ${error.message}`
    );
  }


  return data as GenericRow;
}


async function getCompanyTableRows(
  table: string,
  companyId: string
): Promise<GenericRow[]> {
  const {
    data,
    error,
  } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId);


  if (error) {
    throw new Error(
      `Could not export ${table}: ${error.message}`
    );
  }


  return (data ?? []) as GenericRow[];
}


async function getSalesOrderItems(
  companyId: string
): Promise<GenericRow[]> {
  const {
    data: salesOrders,
    error: salesOrderError,
  } = await supabase
    .from("sales_order")
    .select("id")
    .eq("company_id", companyId);


  if (salesOrderError) {
    throw new Error(
      `Could not identify sales orders: ${salesOrderError.message}`
    );
  }


  const ids =
    (salesOrders ?? [])
      .map((row) => row.id)
      .filter(Boolean);


  if (ids.length === 0) {
    return [];
  }


  const allRows: GenericRow[] = [];

  const batchSize = 200;


  for (
    let index = 0;
    index < ids.length;
    index += batchSize
  ) {
    const batch =
      ids.slice(
        index,
        index + batchSize
      );


    const {
      data,
      error,
    } = await supabase
      .from("sales_order_item")
      .select("*")
      .in("sales_order_id", batch);


    if (error) {
      throw new Error(
        `Could not export sales order items: ${error.message}`
      );
    }


    allRows.push(
      ...((data ?? []) as GenericRow[])
    );
  }


  return allRows;
}


function csvEscape(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  let text: string;


  if (
    typeof value === "object"
  ) {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }


  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(
      /"/g,
      '""'
    )}"`;
  }


  return text;
}


function rowsToCsv(
  rows: GenericRow[]
): string {
  if (rows.length === 0) {
    return "";
  }


  const headers =
    Array.from(
      new Set(
        rows.flatMap(
          (row) =>
            Object.keys(row)
        )
      )
    );


  const output = [
    headers.join(","),
    ...rows.map(
      (row) =>
        headers
          .map(
            (header) =>
              csvEscape(
                row[header]
              )
          )
          .join(",")
    ),
  ];


  return output.join("\n");
}


function safeName(
  value: string
): string {
  return value
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]+/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    );
}


function addDataset(
  zip: JSZip,
  folder: string,
  filename: string,
  rows: GenericRow[]
) {
  const target =
    zip.folder(folder);

  if (!target) {
    throw new Error(
      `Could not create export folder: ${folder}`
    );
  }


  target.file(
    `${filename}.json`,
    JSON.stringify(
      rows,
      null,
      2
    )
  );


  target.file(
    `${filename}.csv`,
    rowsToCsv(rows)
  );
}


async function sha256(
  blob: Blob
): Promise<string> {
  const buffer =
    await blob.arrayBuffer();

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      buffer
    );


  return Array.from(
    new Uint8Array(digest)
  )
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


function downloadBlob(
  blob: Blob,
  filename: string
) {
  const url =
    URL.createObjectURL(blob);


  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );
}


export async function requestExportJob(
  exportType: ExportType
): Promise<string> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "request_company_export",
    {
      p_export_type: exportType,
      p_export_format: "zip",
      p_include_documents: false,
    }
  );


  if (error) {
    throw new Error(error.message);
  }


  return data as string;
}


export async function getExportJobs(): Promise<
  CompanyExportJob[]
> {
  const companyId =
    await getCurrentCompanyId();


  const {
    data,
    error,
  } = await supabase
    .from("company_export_job")
    .select("*")
    .eq("company_id", companyId)
    .order(
      "requested_at",
      {
        ascending: false,
      }
    )
    .limit(50);


  if (error) {
    throw new Error(error.message);
  }


  return (
    data ?? []
  ) as CompanyExportJob[];
}


async function completeExportJob(
  jobId: string,
  size: number,
  checksum: string
) {
  const {
    error,
  } = await supabase.rpc(
    "complete_company_export",
    {
      p_export_job_id: jobId,
      p_file_size_bytes: size,
      p_checksum_sha256: checksum,
    }
  );


  if (error) {
    throw new Error(error.message);
  }
}


async function failExportJob(
  jobId: string,
  message: string
) {
  await supabase.rpc(
    "fail_company_export",
    {
      p_export_job_id: jobId,
      p_error_message: message,
    }
  );
}


export async function createPortableCompanyBackup(
  exportType: ExportType = "business_data"
): Promise<{
  filename: string;
  size: number;
  checksum: string;
}> {
  let jobId: string | null = null;


  try {
    jobId =
      await requestExportJob(
        exportType
      );


    const companyId =
      await getCurrentCompanyId();


    const company =
      await getCompanyRow(
        companyId
      );


    const zip =
      new JSZip();


    const exportedTables: {
      table: string;
      records: number;
    }[] = [];


    const companyFolder =
      zip.folder("company");

    companyFolder?.file(
      "company.json",
      JSON.stringify(
        company,
        null,
        2
      )
    );


    companyFolder?.file(
      "company.csv",
      rowsToCsv(
        company
          ? [company]
          : []
      )
    );


    exportedTables.push({
      table: "company",
      records: company
        ? 1
        : 0,
    });


    for (
      const definition
      of DIRECT_COMPANY_TABLES
    ) {
      const rows =
        await getCompanyTableRows(
          definition.table,
          companyId
        );


      addDataset(
        zip,
        definition.folder,
        definition.filename,
        rows
      );


      exportedTables.push({
        table:
          definition.table,
        records:
          rows.length,
      });
    }


    const salesOrderItems =
      await getSalesOrderItems(
        companyId
      );


    addDataset(
      zip,
      "sales",
      "sales-order-items",
      salesOrderItems
    );


    exportedTables.push({
      table: "sales_order_item",
      records:
        salesOrderItems.length,
    });


    if (
      exportType !==
      "business_data"
    ) {
      for (
        const definition
        of SETTINGS_TABLES
      ) {
        const rows =
          await getCompanyTableRows(
            definition.table,
            companyId
          );


        addDataset(
          zip,
          definition.folder,
          definition.filename,
          rows
        );


        exportedTables.push({
          table:
            definition.table,
          records:
            rows.length,
        });
      }


      for (
        const definition
        of GOVERNANCE_TABLES
      ) {
        const rows =
          await getCompanyTableRows(
            definition.table,
            companyId
          );


        addDataset(
          zip,
          definition.folder,
          definition.filename,
          rows
        );


        exportedTables.push({
          table:
            definition.table,
          records:
            rows.length,
        });
      }
    }


    const generatedAt =
      new Date().toISOString();


    const companyName =
      String(
        company?.company_name ??
        company?.name ??
        "company"
      );


    const manifest = {
      product:
        "JINLAB Nexus",

      backup_format:
        "portable-company-backup",

      backup_version:
        "1.0",

      database_engine:
        "PostgreSQL",

      company_id:
        companyId,

      company_name:
        companyName,

      export_type:
        exportType,

      generated_at:
        generatedAt,

      formats: [
        "CSV",
        "JSON",
      ],

      documents_included:
        false,

      authentication_secrets_included:
        false,

      tables:
        exportedTables,

      notes:
        "This package contains company-owned business records exported from JINLAB Nexus. It does not contain Supabase service keys, passwords, authentication secrets, or data belonging to other Nexus tenants.",
    };


    zip.file(
      "manifest.json",
      JSON.stringify(
        manifest,
        null,
        2
      )
    );


    zip.file(
      "README.txt",
`JINLAB NEXUS PORTABLE COMPANY BACKUP

Company:
${companyName}

Company ID:
${companyId}

Generated:
${generatedAt}

Export type:
${exportType}

This archive contains portable JSON and CSV copies of company-owned records.

CSV files can be opened with spreadsheet software and imported into many accounting, CRM, ERP and management systems.

JSON files preserve structured data for developers and migration tools.

This archive does NOT contain:
- user passwords
- authentication hashes
- Supabase service keys
- JINLAB Nexus platform secrets
- records belonging to other companies

Database origin:
PostgreSQL / Supabase

Backup specification:
JINLAB Nexus Portable Backup v1.0
`
    );


    const blob =
      await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
          level: 6,
        },
      });


    const checksum =
      await sha256(blob);


    const date =
      new Date()
        .toISOString()
        .slice(0, 10);


    const filename =
      `JINLAB-NEXUS-${safeName(
        companyName
      ) || "COMPANY"}-${date}.zip`;


    await completeExportJob(
      jobId,
      blob.size,
      checksum
    );


    downloadBlob(
      blob,
      filename
    );


    return {
      filename,
      size: blob.size,
      checksum,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Company export failed.";


    if (jobId) {
      try {
        await failExportJob(
          jobId,
          message
        );
      } catch {
        // Preserve original export error.
      }
    }


    throw error;
  }
}
