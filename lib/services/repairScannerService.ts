import { supabase } from "@/lib/supabase";

export type RepairScannerDevice = {
  id: string;
  branch_id: string;
  device_code: string;
  name: string;
  purpose: string;
  is_active: boolean;
  last_seen_at: string | null;
};

export type RepairScanJob = {
  id: string;
  job_number: string;
  status: string;
  customer_name: string;
  device_type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  imei: string | null;
  reported_fault: string;
  assigned_employee: string | null;
  intake_confirmed: boolean;
  approved_amount: number | null;
  repair_started_at: string | null;
  invoice_number: string | null;
  balance_due: number | null;
};

export type RepairScanResult = {
  ok: boolean;
  found: boolean;
  match_type?: string;
  action?: string;
  scan_value?: string;
  message?: string;
  job?: RepairScanJob;
};

export type CreateRepairJobInput = {
  branchId: string;
  customerId: string;
  deviceType: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  imei?: string;
  deviceCondition?: string;
  accessoriesReceived?: string;
  reportedFault: string;
  assignedEmployeeId?: string | null;
};

export async function getRepairScannerDevices() {
  const { data, error } = await supabase.rpc(
    "list_service_scanner_devices"
  );

  if (error) throw new Error(error.message);

  return (data ?? []) as RepairScannerDevice[];
}

export async function scanRepairJob(
  scannerDeviceId: string,
  value: string,
  action = "lookup"
): Promise<RepairScanResult> {
  const { data, error } = await supabase.rpc(
    "scan_service_job",
    {
      p_scanner_device_id: scannerDeviceId,
      p_scanned_value: value.trim(),
      p_action: action,
    }
  );

  if (error) throw new Error(error.message);

  return data as RepairScanResult;
}

export async function createRepairJob(
  input: CreateRepairJobInput
) {
  const { data, error } = await supabase.rpc(
    "create_service_job",
    {
      p_branch_id: input.branchId,
      p_customer_id: input.customerId,
      p_device_type: input.deviceType.trim(),
      p_brand: input.brand?.trim() || null,
      p_model: input.model?.trim() || null,
      p_serial_number: input.serialNumber?.trim() || null,
      p_imei: input.imei?.trim() || null,
      p_device_condition: input.deviceCondition?.trim() || null,
      p_accessories_received:
        input.accessoriesReceived?.trim() || null,
      p_reported_fault: input.reportedFault.trim(),
      p_assigned_employee_id:
        input.assignedEmployeeId || null,
    }
  );

  if (error) throw new Error(error.message);

  return data as {
    ok: boolean;
    id: string;
    job_number: string;
    status: string;
    assigned_employee_id: string | null;
  };
}

export async function confirmRepairIntake(
  jobId: string,
  method: string,
  reference: string
) {
  const { data, error } = await supabase.rpc(
    "confirm_service_job_intake",
    {
      p_job_id: jobId,
      p_method: method.trim(),
      p_reference: reference.trim(),
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function updateRepairTechnical(
  jobId: string,
  diagnosis: string,
  proposedAmount: number
) {
  const { data, error } = await supabase.rpc(
    "update_service_job_technical",
    {
      p_job_id: jobId,
      p_diagnosis: diagnosis.trim(),
      p_proposed_amount: proposedAmount,
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function approveRepairQuote(
  jobId: string,
  approvedAmount: number,
  method: string,
  reference: string
) {
  const { data, error } = await supabase.rpc(
    "approve_service_job_quote",
    {
      p_job_id: jobId,
      p_approved_amount: approvedAmount,
      p_method: method.trim(),
      p_reference: reference.trim() || null,
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function startRepairJob(jobId: string) {
  const { data, error } = await supabase.rpc(
    "start_service_job_repair",
    {
      p_job_id: jobId,
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function addRepairJobLine(input: {
  jobId: string;
  lineType: "labour" | "service" | "software" | "part" | "other";
  description: string;
  quantity: number;
  unitPrice: number;
  inventoryItemId?: string | null;
}) {
  const { data, error } = await supabase.rpc(
    "add_service_job_line",
    {
      p_job_id: input.jobId,
      p_line_type: input.lineType,
      p_description: input.description.trim(),
      p_quantity: input.quantity,
      p_unit_price: input.unitPrice,
      p_inventory_item_id: input.inventoryItemId || null,
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function completeRepairTechnical(jobId: string) {
  const { data, error } = await supabase.rpc(
    "complete_service_job_technical",
    {
      p_job_id: jobId,
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function autoIssueRepairInvoice(jobId: string) {
  const { data, error } = await supabase.rpc(
    "auto_issue_service_job_invoice",
    { p_job_id: jobId }
  );

  if (error) throw new Error(error.message);

  return data as {
    ok: boolean;
    invoice_id?: string;
    invoice_number?: string;
    invoice_total?: number;
    status?: string;
    already_linked?: boolean;
  };
}

export async function linkRepairInvoice(
  jobId: string,
  invoiceId: string
) {
  const { data, error } = await supabase.rpc(
    "link_service_job_invoice",
    {
      p_job_id: jobId,
      p_invoice_id: invoiceId,
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function confirmRepairCollection(
  jobId: string,
  method: string,
  reference: string
) {
  const { data, error } = await supabase.rpc(
    "confirm_service_job_collection",
    {
      p_job_id: jobId,
      p_method: method.trim(),
      p_reference: reference.trim(),
    }
  );

  if (error) throw new Error(error.message);

  return data;
}

export async function closeRepairJob(jobId: string) {
  const { data, error } = await supabase.rpc(
    "close_service_job",
    {
      p_job_id: jobId,
    }
  );

  if (error) throw new Error(error.message);

  return data;
}
