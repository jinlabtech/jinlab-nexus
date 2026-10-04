"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Barcode,
  Camera,
  CameraOff,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import JobCardQueue from "@/components/repairs/JobCardQueue";
import DigitalRepairHandover from "@/components/repairs/DigitalRepairHandover";
import SearchableRepairPicker from "@/components/repairs/SearchableRepairPicker";
import {
  addRepairJobLine,
  approveRepairQuote,
  autoIssueRepairInvoice,
  closeRepairJob,
  completeRepairTechnical,
  confirmRepairCollection,
  createRepairJob,
  getRepairScannerDevices,
  scanRepairJob,
  startRepairJob,
  updateRepairTechnical,
  type RepairScanResult,
  type RepairScannerDevice,
} from "@/lib/services/repairScannerService";

type Branch = {
  id: string;
  branch_name: string;
};

type Customer = {
  id: string;
  customer_number: string;
  customer_name: string;
  phone: string | null;
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  employee_number: string;
};

type InventoryItem = {
  id: string;
  item_name: string;
  sku: string;
  barcode: string | null;
  selling_price: number;
};

type JobDetail = {
  diagnosis: string | null;
  proposed_amount: number;
  device_condition: string | null;
  accessories_received: string | null;
  intake_confirmed_at: string | null;
  quote_approved_at: string | null;
  repair_started_at: string | null;
  technical_completed_at: string | null;
  collection_confirmed_at: string | null;
  closed_at: string | null;
};

type JobLine = {
  id: string;
  line_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  inventory_item_id: string | null;
  created_at: string;
};

type JobEvent = {
  metadata?: Record<string, unknown> | null;
  id: string;
  event_type: string;
  description: string;
  created_at: string;
};

type ScanAction =
  | "lookup"
  | "intake"
  | "workbench"
  | "diagnosis"
  | "repair_start"
  | "repair_complete"
  | "collection";

type LineType = "labour" | "service" | "software" | "part" | "other";

type ViewMode = "queue" | "scan" | "new";

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(Number(value ?? 0));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldClass() {
  return "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
}

function cardClass() {
  return "rounded-2xl border bg-background p-5 shadow-sm";
}

export default function RepairScannerPage() {
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const cameraLockedRef = useRef(false);

  const [, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("JINLAB");
  const [userName, setUserName] = useState("JINLAB User");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const [viewMode, setViewMode] = useState<ViewMode>("queue");

  const [
    autoHandoverJobNumber,
    setAutoHandoverJobNumber,
  ] = useState<string | null>(null);
  const [scannerDevices, setScannerDevices] = useState<RepairScannerDevice[]>([]);
  const [scannerDeviceId, setScannerDeviceId] = useState("");
  const [scanAction, setScanAction] = useState<ScanAction>("lookup");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<RepairScanResult | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [smartCandidates, setSmartCandidates] = useState<Array<{
    id: string;
    job_number: string;
    status: string;
    customer_name: string;
    device_type?: string | null;
    brand?: string | null;
    model?: string | null;
    serial_number?: string | null;
    imei?: string | null;
    score?: number;
  }>>([]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [jobLines, setJobLines] = useState<JobLine[]>([]);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [newBranchId, setNewBranchId] = useState("");
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newAssignedEmployeeId, setNewAssignedEmployeeId] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [imei, setImei] = useState("");
  const [deviceCondition, setDeviceCondition] = useState("");
  const [accessoriesReceived, setAccessoriesReceived] = useState("");
  const [reportedFault, setReportedFault] = useState("");

  // NEXUS EYE LOCAL IMAGE READER
  type NexusEyeReading = {
    device_type: string | null;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    imei: string | null;
    detected_text: string[];
    raw_text: string;
    overall_confidence: number;
    autofill_confident: boolean;
    summary: string;
  };

  const [eyeBusy, setEyeBusy] = useState(false);
  const [eyeAnalysis, setEyeAnalysis] = useState<NexusEyeReading | null>(null);

  const [deviceSuggestions, setDeviceSuggestions] = useState<Array<{
    device_type: string | null;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    imei: string | null;
    match_type: string;
    confidence: number;
    occurrences: number;
  }>>([]);
  const [deviceSuggestLoading, setDeviceSuggestLoading] = useState(false);


  const [diagnosis, setDiagnosis] = useState("");
  const [proposedAmount, setProposedAmount] = useState("");

  const [approvalMethod, setApprovalMethod] = useState("customer_signature");
  const [approvalReference, setApprovalReference] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");

  const [lineType, setLineType] = useState<LineType>("service");
  const [lineDescription, setLineDescription] = useState("");
  const [lineQuantity, setLineQuantity] = useState("1");
  const [lineUnitPrice, setLineUnitPrice] = useState("");
  const [lineInventoryItemId, setLineInventoryItemId] = useState("");

  const [collectionMethod, setCollectionMethod] = useState("customer_signature");
  const [collectionReference, setCollectionReference] = useState("");

  const can = (permission: string) => permissions.has(permission);

  const selectedJob = result?.found ? result.job ?? null : null;

  const jobLinesTotal = useMemo(
    () => jobLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0),
    [jobLines]
  );

  useEffect(() => {
    const value =
      imei.trim() ||
      serialNumber.trim() ||
      model.trim() ||
      brand.trim();

    if (value.length < 3) {
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setDeviceSuggestLoading(true);

      const { data, error } = await supabase.rpc(
        "suggest_service_device_identity",
        {
          p_value: value,
          p_limit: 6,
        }
      );

      if (!cancelled) {
        setDeviceSuggestions(error ? [] : ((data ?? []) as typeof deviceSuggestions));
        setDeviceSuggestLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imei, serialNumber, model, brand]);

  function applyDeviceSuggestion(suggestion: (typeof deviceSuggestions)[number]) {
    if (suggestion.device_type) setDeviceType(suggestion.device_type);
    if (suggestion.brand) setBrand(suggestion.brand);
    if (suggestion.model) setModel(suggestion.model);

    if (suggestion.match_type === "imei") {
      if (suggestion.imei) setImei(suggestion.imei);
      if (suggestion.serial_number) setSerialNumber(suggestion.serial_number);
    }

    if (suggestion.match_type === "serial_number") {
      if (suggestion.serial_number) setSerialNumber(suggestion.serial_number);
      if (suggestion.imei) setImei(suggestion.imei);
    }

    setDeviceSuggestions([]);
    setMessage("Device details filled from JINLAB repair history.");
  }

  async function nexusEyeImageData(file: File) {
    const url = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = () => reject(new Error("Nexus Eye could not read this photo."));
        next.src = url;
      });

      const maximum = 1800;
      const scale = Math.min(
        1,
        maximum / Math.max(image.naturalWidth, image.naturalHeight)
      );

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Nexus Eye could not prepare the photo.");
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL("image/jpeg", 0.84);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function analyseWithNexusEye(file: File) {
    setEyeBusy(true);
    setEyeAnalysis(null);
    setErrorMessage("");
    setMessage("");

    try {
      const imageDataUrl = await nexusEyeImageData(file);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your Nexus session has expired. Please sign in again.");
      }

      const response = await fetch("/api/nexus-eye/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          imageDataUrl,
          reportedFault,
          known: {
            deviceType,
            brand,
            model,
            serialNumber,
            imei,
          },
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Nexus Eye analysis failed.");
      }

      const analysis = payload.analysis;
      setEyeAnalysis(analysis);

      const confident =
        analysis?.autofill_confident ||
        Number(analysis?.overall_confidence ?? 0) >= 80;

      if (confident) {
        if (!deviceType.trim() && analysis.device_type) {
          setDeviceType(analysis.device_type);
        }

        if (!brand.trim() && analysis.brand) {
          setBrand(analysis.brand);
        }

        if (!model.trim() && analysis.model) {
          setModel(analysis.model);
        }

        if (
          !serialNumber.trim() &&
          analysis.serial_number &&
          Number(analysis.overall_confidence ?? 0) >= 85
        ) {
          setSerialNumber(analysis.serial_number);
        }

        if (
          !imei.trim() &&
          analysis.imei &&
          Number(analysis.overall_confidence ?? 0) >= 85
        ) {
          setImei(analysis.imei);
        }

      }

      setMessage(
        confident
          ? "Nexus Eye read the image and filled high-confidence visible details."
          : "Nexus Eye read the image. Please review the visible details before saving."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nexus Eye could not read this image."
      );
    } finally {
      setEyeBusy(false);
    }
  }

  const customerOptions = useMemo(() => customers.map((customer) => ({
    id: customer.id,
    label: customer.customer_name,
    detail: [customer.customer_number, customer.phone].filter(Boolean).join(" · "),
    searchText: [customer.customer_name, customer.customer_number, customer.phone].filter(Boolean).join(" "),
  })), [customers]);

  const inventoryOptions = useMemo(() => inventoryItems.map((item) => ({
    id: item.id,
    label: item.item_name,
    detail: `${item.sku} · ${money(item.selling_price)}`,
    searchText: [item.item_name, item.sku, item.barcode].filter(Boolean).join(" "),
  })), [inventoryItems]);

  useEffect(() => {
    async function initialise() {
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profile")
        .select("full_name, company_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMessage(profileError.message);
        return;
      }

      if (!profile?.company_id) {
        setErrorMessage("Your account is not linked to a company.");
        return;
      }

      const currentCompanyId = profile.company_id;
      setCompanyId(currentCompanyId);
      setUserName(profile.full_name || user.email || "JINLAB User");

      const [companyResponse, permissionResponse] = await Promise.all([
        supabase
          .from("company")
          .select("company_name")
          .eq("id", currentCompanyId)
          .maybeSingle(),
        supabase.rpc("get_current_user_permissions"),
      ]);

      if (companyResponse.data?.company_name) {
        setCompanyName(companyResponse.data.company_name);
      }

      if (!permissionResponse.error) {
        setPermissions(
          new Set(
            (permissionResponse.data ?? []).map(
              (row: { permission_name: string }) => row.permission_name
            )
          )
        );
      }

      try {
        const devices = await getRepairScannerDevices();
        setScannerDevices(devices);
        if (devices[0]) setScannerDeviceId(devices[0].id);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Repair scanner could not be loaded."
        );
      }

      const [branchResponse, customerResponse, employeeResponse, inventoryResponse] =
        await Promise.all([
          supabase
            .from("branch")
            .select("id, branch_name")
            .eq("company_id", currentCompanyId)
            .order("branch_name"),
          supabase
            .from("customer")
            .select("id, customer_number, customer_name, phone")
            .eq("company_id", currentCompanyId)
            .eq("is_active", true)
            .order("customer_name")
            .limit(1000),
          supabase.rpc("list_repair_assignable_employees"),
          supabase
            .from("inventory_item")
            .select("id, item_name, sku, barcode, selling_price")
            .eq("company_id", currentCompanyId)
            .eq("is_active", true)
            .order("item_name")
            .limit(1000),
        ]);

      if (!branchResponse.error) {
        const rows = (branchResponse.data ?? []) as Branch[];
        setBranches(rows);
        if (rows[0]) setNewBranchId(rows[0].id);
      }

      if (!customerResponse.error) {
        setCustomers((customerResponse.data ?? []) as Customer[]);
      }

      if (!employeeResponse.error) {
        setEmployees(
          (employeeResponse.data ?? []).map((employee: { id: string; display_name?: string | null; employee_number?: string | null }) => ({
            id: employee.id,
            first_name: employee.display_name ?? "",
            last_name: "",
            employee_number: employee.employee_number ?? "",
          })) as Employee[]
        );
      }

      if (!inventoryResponse.error) {
        setInventoryItems((inventoryResponse.data ?? []) as InventoryItem[]);
      }
    }

    void initialise();

    return () => {
      controlsRef.current?.stop();
    };
  }, [router]);

  async function loadJobDetails(jobId: string) {
    const [detailResponse, lineResponse, eventResponse] = await Promise.all([
      supabase
        .from("service_job")
        .select(
          "diagnosis, proposed_amount, device_condition, accessories_received, intake_confirmed_at, quote_approved_at, repair_started_at, technical_completed_at, collection_confirmed_at, closed_at"
        )
        .eq("id", jobId)
        .maybeSingle(),
      supabase
        .from("service_job_line")
        .select(
          "id, line_type, description, quantity, unit_price, line_total, inventory_item_id, created_at"
        )
        .eq("service_job_id", jobId)
        .order("created_at"),
      supabase
        .from("service_job_event")
        .select("id, event_type, description, created_at, metadata")
        .eq("service_job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (!detailResponse.error && detailResponse.data) {
      const detail = detailResponse.data as JobDetail;
      setJobDetail(detail);
      setDiagnosis(detail.diagnosis ?? "");
      setProposedAmount(
        Number(detail.proposed_amount || 0) > 0
          ? String(detail.proposed_amount)
          : ""
      );
    }

    if (!lineResponse.error) {
      setJobLines((lineResponse.data ?? []) as JobLine[]);
    }

    if (!eventResponse.error) {
      setJobEvents((eventResponse.data ?? []) as JobEvent[]);
    }
  }

  async function lookup(raw: string, action: ScanAction = scanAction) {
    void action;
    const value = raw.trim();

    if (!value) return;

    if (!scannerDeviceId) {
      setErrorMessage("Select a registered repair scanner first.");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    setMessage("");
    setSmartCandidates([]);

    try {
      const { data, error } = await supabase.rpc("smart_identify_service_job", {
        p_scanner_device_id: scannerDeviceId,
        p_scanned_value: value,
      });

      if (error) throw error;

      const smart = (data ?? {}) as {
        ambiguous?: boolean;
        found?: boolean;
        job?: NonNullable<RepairScanResult["job"]>;
        candidates?: typeof smartCandidates;
        message?: string;
      };

      if (smart.ambiguous) {
        setResult(null);
        setJobDetail(null);
        setJobLines([]);
        setJobEvents([]);
        setSmartCandidates(smart.candidates ?? []);
        setMessage("More than one device matched. Tap the correct Job Card.");
      } else if (!smart.found || !smart.job) {
        setResult(null);
        setJobDetail(null);
        setJobLines([]);
        setJobEvents([]);
        setErrorMessage(
          smart.message ??
            "No matching Job Card, IMEI, serial number or model was found."
        );
      } else {
        const next = smart as RepairScanResult;
        setResult(next);
        setApprovedAmount(
          next.job?.approved_amount != null
            ? String(next.job.approved_amount)
            : ""
        );

        if (next.job) {
          await loadJobDetails(next.job.id);
        }
      }

      setCode("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Smart device scan failed."
      );
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function refreshCurrentJob(successMessage?: string) {
    if (!selectedJob) return;

    const next = await scanRepairJob(
      scannerDeviceId,
      selectedJob.job_number,
      "lookup"
    );

    setResult(next);

    if (next.job) {
      setApprovedAmount(
        next.job.approved_amount != null ? String(next.job.approved_amount) : ""
      );
      await loadJobDetails(next.job.id);
    }

    if (successMessage) setMessage(successMessage);
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
  }

  async function startCamera() {
    setErrorMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Camera scanning is not available in this browser.");
      return;
    }

    if (!videoRef.current) return;

    try {
      cameraLockedRef.current = false;

      const reader = new BrowserMultiFormatReader();

      setCameraActive(true);

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current,
        (scanResult, _error, scannerControls) => {
          if (!scanResult || cameraLockedRef.current) return;

          cameraLockedRef.current = true;

          const scanned = scanResult.getText().trim();

          scannerControls.stop();
          controlsRef.current = null;
          setCameraActive(false);
          setCode(scanned);

          void lookup(scanned, "lookup");
        }
      );

      controlsRef.current = controls;
    } catch (error) {
      setCameraActive(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start the smart camera scanner."
      );
    }
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!selectedJob) return;

    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      await action();
      await refreshCurrentJob(successMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createNewJob() {
    if (!newBranchId || !newCustomerId || !deviceType.trim() || !reportedFault.trim()) {
      setErrorMessage("Branch, customer, device type and reported fault are required.");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      const created = await createRepairJob({
        branchId: newBranchId,
        customerId: newCustomerId,
        deviceType,
        brand,
        model,
        serialNumber,
        imei,
        deviceCondition,
        accessoriesReceived,
        reportedFault,
        assignedEmployeeId: newAssignedEmployeeId || null,
      });

      setViewMode("scan");
      setMessage(
        `${created.job_number} created. Complete the customer handover before diagnosis.`
      );

      setDeviceType("");
      setBrand("");
      setModel("");
      setSerialNumber("");
      setImei("");
      setDeviceCondition("");
      setAccessoriesReceived("");
      setReportedFault("");
      setDeviceSuggestions([]);
      setNewCustomerId("");
      setNewAssignedEmployeeId("");

      setCode(created.job_number);
      setAutoHandoverJobNumber(
        created.job_number
      );

      await lookup(
        created.job_number,
        "intake"
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Job card could not be created."
      );
    } finally {
      setBusy(false);
    }
  }


  async function saveDiagnosis() {
    if (!selectedJob) return;

    const amount = Number(proposedAmount);

    if (!diagnosis.trim()) {
      setErrorMessage("Diagnosis is required.");
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setErrorMessage("Enter a valid proposed amount.");
      return;
    }

    await runAction(
      () => updateRepairTechnical(selectedJob.id, diagnosis, amount),
      "Diagnosis and proposed price recorded."
    );
  }

  async function approveQuote() {
    if (!selectedJob) return;

    const amount = Number(approvedAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      setErrorMessage("Enter a valid approved amount.");
      return;
    }

    if (!approvalReference.trim()) {
      setErrorMessage("Customer approval reference is required.");
      return;
    }

    await runAction(
      () =>
        approveRepairQuote(
          selectedJob.id,
          amount,
          approvalMethod,
          approvalReference
        ),
      "Customer-approved repair price recorded."
    );
  }

  async function addLine() {
    if (!selectedJob) return;

    const quantity = Number(lineQuantity);
    const unitPrice = Number(lineUnitPrice);

    if (!lineDescription.trim()) {
      setErrorMessage("Repair/service line description is required.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage("Quantity must be greater than zero.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setErrorMessage("Enter a valid unit price.");
      return;
    }

    if (lineType === "part" && !lineInventoryItemId) {
      setErrorMessage("Select the inventory item used for this part line.");
      return;
    }

    await runAction(
      () =>
        addRepairJobLine({
          jobId: selectedJob.id,
          lineType,
          description: lineDescription,
          quantity,
          unitPrice,
          inventoryItemId: lineType === "part" ? lineInventoryItemId : null,
        }),
      "Repair/service line added."
    );

    setLineDescription("");
    setLineQuantity("1");
    setLineUnitPrice("");
    setLineInventoryItemId("");
  }

  async function collectJob() {
    if (!selectedJob) return;

    if (!collectionReference.trim()) {
      setErrorMessage("Customer collection confirmation reference is required.");
      return;
    }

    await runAction(
      () =>
        confirmRepairCollection(
          selectedJob.id,
          collectionMethod,
          collectionReference
        ),
      "Collection confirmed. Job card closed automatically."
    );
  }

  async function logout() {
    stopCamera();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={companyName}
        userName={userName}
        onLogout={logout}
      />

      <main className="nexus-repairs-page mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="nexus-repairs-header mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">JINLAB NEXUS REPAIR CONTROL</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Job Card Processing Station
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Scan a JINLAB job number, serial number or IMEI and process the repair through the controlled workflow.
            </p>
          </div>

          <div className="nexus-repairs-modes flex flex-wrap gap-2">
            <Button
              type="button"
              className={viewMode === "queue" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
              variant={viewMode === "queue" ? "default" : "outline"}
              onClick={() => setViewMode("queue")}
            >
              <span className="hidden sm:inline">Job Card Queue</span>
              <span className="sm:hidden">Queue</span>
            </Button>

            <Button
              type="button"
              className={
                viewMode === "scan"
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : ""
              }
              variant={viewMode === "scan" ? "default" : "outline"}
              onClick={() => setViewMode("scan")}
            >
              <Barcode className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Scan & Process</span>
              <span className="sm:hidden">Scan</span>
            </Button>

            {can("repair.create") && (
              <Button
                type="button"
                className={
                  viewMode === "new"
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : ""
                }
                variant={viewMode === "new" ? "default" : "outline"}
                onClick={() => setViewMode("new")}
              >
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New Job Card</span>
                <span className="sm:hidden">+ Job</span>
              </Button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        )}

        {viewMode === "queue" && (
          <JobCardQueue
            canDelete={can("repair.delete")}
            onOpen={(jobNumber) => {
              setViewMode("scan");
              void lookup(jobNumber, "lookup");
            }}
          />
        )}

        {viewMode === "queue" ? null : viewMode === "new" && can("repair.create") ? (
          <div className={`${cardClass()} nexus-repair-new-card`}>

            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold">Open New Job Card</h2>
                <p className="text-sm text-muted-foreground">
                  Device must be registered before diagnosis or repair.
                </p>
              </div>
            </div>

            <div className="nexus-repair-new-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Branch *</span>
                <SearchableSelect searchLabel="Branches"
                  className={fieldClass()}
                  value={newBranchId}
                  onValueChange={(selectedValue) => setNewBranchId(selectedValue)}
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.branch_name}
                    </option>
                  ))}
                </SearchableSelect>
              </label>

              <div className="md:col-span-2">
                <SearchableRepairPicker
                  label="Customer *"
                  labelAction={
                    <Link href="/customers" className="text-xs font-semibold text-blue-600 hover:underline">
                      Create customer
                    </Link>
                  }
                  placeholder="Search customer name, number or phone"
                  emptyMessage="No active customers available. Create a customer to continue."
                  options={customerOptions}
                  value={newCustomerId}
                  onChange={setNewCustomerId}
                />
              </div>

              {can("repair.assign") && (
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Assign technician</span>
                  <SearchableSelect searchLabel="Employees"
                    className={fieldClass()}
                    value={newAssignedEmployeeId}
                    onValueChange={(selectedValue) => setNewAssignedEmployeeId(selectedValue)}
                  >
                    <option value="">Unassigned</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.first_name} {employee.last_name} · {employee.employee_number}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>
              )}

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Device type *</span>
                <input
                  className={fieldClass()}
                  value={deviceType}
                  onChange={(event) => setDeviceType(event.target.value)}
                  placeholder="Laptop, phone, desktop..."
                />
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Brand</span>
                <input
                  className={fieldClass()}
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  placeholder="Dell, HP, Samsung..."
                />
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Model</span>
                <input
                  className={fieldClass()}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="Model"
                />
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Serial number</span>
                <input
                  className={fieldClass()}
                  value={serialNumber}
                  onChange={(event) => setSerialNumber(event.target.value)}
                  placeholder="Serial / service tag"
                />
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">IMEI</span>
                <input
                  className={fieldClass()}
                  value={imei}
                  onChange={(event) => setImei(event.target.value)}
                  placeholder="IMEI for mobile device"
                />
              </label>

              <div className="md:col-span-2 xl:col-span-3">
                <div className="rounded-xl border border-blue-100 bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-700">
                        Smart Device Assist
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Enter IMEI, serial, model or brand. Nexus will suggest known device details.
                      </p>
                    </div>
                    {deviceSuggestLoading && (
                      <span className="text-xs text-muted-foreground">
                        Checking...
                      </span>
                    )}
                  </div>

                  {deviceSuggestions.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {deviceSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.serial_number ?? ""}-${suggestion.imei ?? ""}-${index}`}
                          type="button"
                          onClick={() => applyDeviceSuggestion(suggestion)}
                          className="rounded-lg border bg-background p-3 text-left transition hover:border-blue-400 hover:bg-blue-50"
                        >
                          <p className="font-semibold">
                            {[suggestion.brand, suggestion.model]
                              .filter(Boolean)
                              .join(" ") || suggestion.device_type || "Known device"}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {suggestion.device_type || "Device"}
                            {suggestion.serial_number
                              ? ` · Serial ${suggestion.serial_number}`
                              : ""}
                            {suggestion.imei
                              ? ` · IMEI ${suggestion.imei}`
                              : ""}
                          </p>

                          <p className="mt-2 text-xs font-semibold text-blue-700">
                            Use these details
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 xl:col-span-3">
                <div className="rounded-2xl border-2 border-blue-200 bg-muted/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-bold text-blue-700">
                        NEXUS EYE
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Point the camera at a device label, model number, serial number or IMEI.
                        Nexus Eye reads visible text and helps fill the Job Card.
                      </p>
                    </div>

                    <label className={`inline-flex h-11 cursor-pointer items-center justify-center rounded-md px-5 text-sm font-semibold text-white ${
                      eyeBusy
                        ? "cursor-wait bg-blue-400"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}>
                      <Camera className="mr-2 h-4 w-4" />
                      {eyeBusy ? "Nexus Eye is reading..." : "Read Device"}

                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={eyeBusy}
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          if (file) {
                            void analyseWithNexusEye(file);
                          }

                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>

                  {eyeAnalysis && (
                    <div className="mt-4 rounded-xl border bg-background p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">
                            {[eyeAnalysis.brand, eyeAnalysis.model]
                              .filter(Boolean)
                              .join(" ") ||
                              eyeAnalysis.device_type ||
                              "Visible device information"}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            OCR confidence: {eyeAnalysis.overall_confidence ?? 0}%
                          </p>
                        </div>

                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                          Local image reader
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Type</p>
                          <p className="font-semibold">
                            {eyeAnalysis.device_type || "Not read"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Brand / Model</p>
                          <p className="font-semibold">
                            {[eyeAnalysis.brand, eyeAnalysis.model]
                              .filter(Boolean)
                              .join(" ") || "Not read"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Serial number</p>
                          <p className="break-all font-semibold">
                            {eyeAnalysis.serial_number || "Not visible"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">IMEI</p>
                          <p className="break-all font-semibold">
                            {eyeAnalysis.imei || "Not visible"}
                          </p>
                        </div>
                      </div>

                      {eyeAnalysis.summary && (
                        <p className="mt-4 text-sm text-muted-foreground">
                          {eyeAnalysis.summary}
                        </p>
                      )}

                      {eyeAnalysis.detected_text?.length > 0 && (
                        <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                          <p className="text-sm font-bold">Visible text</p>

                          <div className="mt-2 space-y-1">
                            {eyeAnalysis.detected_text.map(
                              (line: string, index: number) => (
                                <p
                                  key={`${line}-${index}`}
                                  className="break-words font-mono text-xs text-muted-foreground"
                                >
                                  {line}
                                </p>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      <p className="mt-3 text-xs text-muted-foreground">
                        Nexus Eye reads visible image information only. Confirm identifiers
                        before saving the Job Card.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <label className="space-y-1.5 text-sm md:col-span-2 xl:col-span-3">
                <span className="font-medium">Condition before repair</span>
                <textarea
                  className={`${fieldClass()} min-h-20`}
                  value={deviceCondition}
                  onChange={(event) => setDeviceCondition(event.target.value)}
                  placeholder="Scratches, cracked screen, missing screws, liquid signs..."
                />
              </label>

              <label className="space-y-1.5 text-sm md:col-span-2 xl:col-span-3">
                <span className="font-medium">Accessories received</span>
                <textarea
                  className={`${fieldClass()} min-h-20`}
                  value={accessoriesReceived}
                  onChange={(event) => setAccessoriesReceived(event.target.value)}
                  placeholder="Charger, bag, SIM, memory card, cables..."
                />
              </label>

              <label className="space-y-1.5 text-sm md:col-span-2 xl:col-span-3">
                <span className="font-medium">Customer reported fault *</span>
                <textarea
                  className={`${fieldClass()} min-h-24`}
                  value={reportedFault}
                  onChange={(event) => setReportedFault(event.target.value)}
                  placeholder="Record what the customer says is wrong before diagnosis."
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                disabled={busy}
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => void createNewJob()}
              >
                {busy ? "Creating..." : "Create Job Card"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="nexus-repair-process space-y-5">
            <div className={`${cardClass()} nexus-repair-scan-panel`}>
              <div className="nexus-repair-scanner-settings">
                <div className="nexus-repair-scanner-settings-title md:hidden">
                  Scanner settings
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Registered scanner</span>
                  <SearchableSelect searchLabel="Records"
                    className={fieldClass()}
                    value={scannerDeviceId}
                    onValueChange={(selectedValue) => setScannerDeviceId(selectedValue)}
                  >
                    <option value="">Select scanner</option>
                    {scannerDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name} · {device.device_code}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Scan stage</span>
                  <select
                    className={fieldClass()}
                    value={scanAction}
                    onChange={(event) => setScanAction(event.target.value as ScanAction)}
                  >
                    <option value="lookup">Lookup</option>
                    <option value="intake">Intake</option>
                    <option value="workbench">Workbench</option>
                    <option value="diagnosis">Diagnosis</option>
                    <option value="repair_start">Repair start</option>
                    <option value="repair_complete">Repair complete</option>
                    <option value="collection">Collection</option>
                  </select>
                </label>

                <div className="text-xs text-muted-foreground lg:text-right">
                  USB/Bluetooth scanner: keep the scan box focused and scan.
                </div>
                </div>
              </div>

              <form
                className="nexus-repair-scan-form mt-4 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void lookup(code);
                }}
              >
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    autoFocus
                    className={`${fieldClass()} pl-10`}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Scan or enter Job Card, IMEI, serial or model"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy || !scannerDeviceId}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Search className="mr-2 h-4 w-4" />
                  {busy ? "Checking..." : "Find Job"}
                </Button>

                {cameraActive ? (
                  <Button type="button" variant="outline" onClick={stopCamera}>
                    <CameraOff className="mr-2 h-4 w-4" />
                    Stop Camera
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!scannerDeviceId}
                    onClick={() => void startCamera()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Scan with Camera
                  </Button>
                )}
              </form>

              <video
                ref={videoRef}
                muted
                playsInline
                className={`mt-4 max-h-[440px] w-full rounded-xl bg-black object-cover ${
                  cameraActive ? "block" : "hidden"
                }`}
              />

              {smartCandidates.length > 0 && (
                <div className="mt-4 rounded-xl border bg-muted/20 p-4">
                  <div className="mb-3">
                    <h3 className="font-bold">Possible Device Matches</h3>
                    <p className="text-sm text-muted-foreground">
                      Nexus found more than one possible repair. Tap the correct device.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {smartCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => void lookup(candidate.job_number, "lookup")}
                        className="w-full rounded-xl border bg-background p-3 text-left transition hover:border-blue-400 hover:bg-muted/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-blue-700">
                            {candidate.job_number}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">
                            {statusLabel(candidate.status)}
                          </span>
                        </div>

                        <p className="mt-1 font-semibold">
                          {candidate.customer_name}
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {[candidate.brand, candidate.model, candidate.device_type]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {candidate.serial_number
                            ? `Serial: ${candidate.serial_number}`
                            : candidate.imei
                            ? `IMEI: ${candidate.imei}`
                            : "Matched by device model"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedJob && (
              <>
                <div className={`${cardClass()} nexus-repair-job-summary`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-bold">{selectedJob.job_number}</h2>
                        <span className="rounded-full border bg-muted px-3 py-1 text-xs font-semibold">
                          {statusLabel(selectedJob.status)}
                        </span>
                        {selectedJob.intake_confirmed && (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Intake confirmed
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm text-muted-foreground">
                        Matched by {result?.match_type?.replaceAll("_", " ") ?? "job"}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void refreshCurrentJob()}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </Button>
                  </div>

                  <div className="nexus-repair-job-main-grid mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Customer</p>
                      <p className="mt-1 font-semibold">{selectedJob.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Device</p>
                      <p className="mt-1 font-semibold">
                        {[selectedJob.brand, selectedJob.model, selectedJob.device_type]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Technician</p>
                      <p className="mt-1 font-semibold">
                        {selectedJob.assigned_employee || "Unassigned"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Approved amount</p>
                      <p className="mt-1 text-xl font-bold">
                        {selectedJob.approved_amount == null
                          ? "Not approved"
                          : money(selectedJob.approved_amount)}
                      </p>
                    </div>
                  </div>

                  <div className="nexus-repair-job-detail-grid mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs uppercase text-muted-foreground">Reported fault</p>
                      <p className="mt-2 text-sm">{selectedJob.reported_fault}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs uppercase text-muted-foreground">Device identity</p>
                      <div className="mt-2 space-y-1 text-sm">
                        <p>Serial: {selectedJob.serial_number || "—"}</p>
                        <p>IMEI: {selectedJob.imei || "—"}</p>
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs uppercase text-muted-foreground">Condition received</p>
                      <p className="mt-2 text-sm">{jobDetail?.device_condition || "—"}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs uppercase text-muted-foreground">Accessories</p>
                      <p className="mt-2 text-sm">{jobDetail?.accessories_received || "—"}</p>
                    </div>
                  </div>

                  <div className="nexus-repair-job-timeline mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Intake</p>
                      <p className="mt-1 text-sm font-semibold">{dateTime(jobDetail?.intake_confirmed_at)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Quote approved</p>
                      <p className="mt-1 text-sm font-semibold">{dateTime(jobDetail?.quote_approved_at)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Repair started</p>
                      <p className="mt-1 text-sm font-semibold">{dateTime(jobDetail?.repair_started_at)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Technical complete</p>
                      <p className="mt-1 text-sm font-semibold">{dateTime(jobDetail?.technical_completed_at)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Collection</p>
                      <p className="mt-1 text-sm font-semibold">{dateTime(jobDetail?.collection_confirmed_at)}</p>
                    </div>
                  </div>
                </div>

                {!selectedJob.intake_confirmed &&
                  can("repair.intake.confirm") && (
                    <DigitalRepairHandover
                      jobId={selectedJob.id}
                      jobNumber={selectedJob.job_number}
                      autoStart={
                        autoHandoverJobNumber ===
                        selectedJob.job_number
                      }
                      onAutoStartHandled={() =>
                        setAutoHandoverJobNumber(null)
                      }
                      onVerified={() =>
                        lookup(
                          selectedJob.job_number,
                          "lookup"
                        )
                      }
                    />
                  )}

                {selectedJob.intake_confirmed &&
                  ["received", "diagnosing", "awaiting_approval"].includes(selectedJob.status) &&
                  can("repair.update") && (
                    <div className={`${cardClass()} nexus-repair-action-card`}>
                      <div className="mb-4 flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-blue-600" />
                        <h3 className="font-bold">2. Diagnosis & Proposed Price</h3>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium">Diagnosis *</span>
                          <textarea
                            className={`${fieldClass()} min-h-28`}
                            value={diagnosis}
                            onChange={(event) => setDiagnosis(event.target.value)}
                            placeholder="Technical diagnosis before repair begins"
                          />
                        </label>

                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium">Proposed price *</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={fieldClass()}
                            value={proposedAmount}
                            onChange={(event) => setProposedAmount(event.target.value)}
                            placeholder="0.00"
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          disabled={busy}
                          className="bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => void saveDiagnosis()}
                        >
                          Save Diagnosis & Send for Approval
                        </Button>
                      </div>
                    </div>
                  )}

                {selectedJob.status === "awaiting_approval" && can("repair.quote.approve") && (
                  <div className={`${cardClass()} nexus-repair-action-card`}>
                    <div className="mb-4 flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-blue-600" />
                      <h3 className="font-bold">3. Record Customer Price Approval</h3>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="space-y-1.5 text-sm">
                        <span className="font-medium">Approved amount *</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={fieldClass()}
                          value={approvedAmount}
                          onChange={(event) => setApprovedAmount(event.target.value)}
                        />
                      </label>

                      <label className="space-y-1.5 text-sm">
                        <span className="font-medium">Approval method</span>
                        <select
                          className={fieldClass()}
                          value={approvalMethod}
                          onChange={(event) => setApprovalMethod(event.target.value)}
                        >
                          <option value="customer_signature">Customer signature</option>
                          <option value="otp">Customer OTP</option>
                          <option value="whatsapp">WhatsApp confirmation</option>
                          <option value="email">Email confirmation</option>
                          <option value="phone_call">Recorded company call</option>
                        </select>
                      </label>

                      <label className="space-y-1.5 text-sm">
                        <span className="font-medium">Approval reference *</span>
                        <input
                          className={fieldClass()}
                          value={approvalReference}
                          onChange={(event) => setApprovalReference(event.target.value)}
                          placeholder="OTP / signature / message reference"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        disabled={busy}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => void approveQuote()}
                      >
                        Approve Repair Price
                      </Button>
                    </div>
                  </div>
                )}

                {selectedJob.status === "approved" && can("repair.start") && (
                  <div className={`${cardClass()} border-blue-200 bg-muted/30`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold">4. Start Authorised Repair</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Intake and customer-approved price are recorded. The assigned technician may now begin work.
                        </p>
                      </div>

                      <Button
                        type="button"
                        disabled={busy}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() =>
                          void runAction(
                            () => startRepairJob(selectedJob.id),
                            "Authorised repair started."
                          )
                        }
                      >
                        <Wrench className="mr-2 h-4 w-4" />
                        START REPAIR
                      </Button>
                    </div>
                  </div>
                )}

                <div className={`${cardClass()} nexus-repair-work-card`}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Recorded Work / Parts</h3>
                      <p className="text-sm text-muted-foreground">
                        Recorded total must equal the customer-approved amount before completion.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Recorded total</p>
                      <p className="text-xl font-bold">{money(jobLinesTotal)}</p>
                    </div>
                  </div>

                  {jobLines.length > 0 ? (
                    <div className="space-y-2">
                      {jobLines.map((line) => (
                        <div
                          key={line.id}
                          className="grid gap-2 rounded-xl border p-3 text-sm sm:grid-cols-[110px_1fr_auto] sm:items-center"
                        >
                          <span className="font-semibold capitalize">{line.line_type}</span>
                          <div>
                            <p className="font-medium">{line.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {Number(line.quantity)} × {money(line.unit_price)}
                            </p>
                          </div>
                          <span className="font-bold">{money(line.line_total)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      No work/service lines recorded yet.
                    </p>
                  )}

                  {selectedJob.status === "in_progress" && can("repair.update") && (
                    <div className="mt-5 border-t pt-5">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium">Type</span>
                          <select
                            className={fieldClass()}
                            value={lineType}
                            onChange={(event) => setLineType(event.target.value as LineType)}
                          >
                            <option value="labour">Labour</option>
                            <option value="service">Service</option>
                            <option value="software">Software</option>
                            <option value="part">Part</option>
                            <option value="other">Other</option>
                          </select>
                        </label>

                        <label className="space-y-1.5 text-sm md:col-span-1 xl:col-span-2">
                          <span className="font-medium">Description</span>
                          <input
                            className={fieldClass()}
                            value={lineDescription}
                            onChange={(event) => setLineDescription(event.target.value)}
                            placeholder="Work performed / item used"
                          />
                        </label>

                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium">Qty</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className={fieldClass()}
                            value={lineQuantity}
                            onChange={(event) => setLineQuantity(event.target.value)}
                          />
                        </label>

                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium">Unit price</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={fieldClass()}
                            value={lineUnitPrice}
                            onChange={(event) => setLineUnitPrice(event.target.value)}
                          />
                        </label>
                      </div>

                      {lineType === "part" && (
                        <div className="mt-3">
                          <SearchableRepairPicker
                            label="Inventory part used *"
                            placeholder="Search part name, SKU or barcode"
                            emptyMessage="No active inventory parts available."
                            options={inventoryOptions}
                            value={lineInventoryItemId}
                            onChange={(id) => {
                              setLineInventoryItemId(id);
                              const item = inventoryItems.find((row) => row.id === id);
                              if (item && !lineDescription) setLineDescription(item.item_name);
                              if (item && !lineUnitPrice) setLineUnitPrice(String(item.selling_price));
                            }}
                          />
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void addLine()}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Work Line
                        </Button>

                        {can("repair.complete") && (
                          <Button
                            type="button"
                            disabled={busy}
                            className="bg-blue-600 text-white hover:bg-blue-700"
                            onClick={() =>
                              void runAction(
                                () => completeRepairTechnical(selectedJob.id),
                                "Technical repair completed. Nexus is creating and linking the invoice automatically."
                              )
                            }
                          >
                            Complete Technical Work
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {selectedJob.status === "technical_complete" &&
                  can("repair.invoice.auto") && (
                    <div className={`${cardClass()} border-blue-200 bg-muted/30`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-bold">Automatic Invoice</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Normally Nexus creates the invoice automatically when technical work is completed. Use this only if the automatic attempt needs a retry.
                          </p>
                        </div>
                        <Button
                          type="button"
                          disabled={busy}
                          className="bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() =>
                            void runAction(
                              () => autoIssueRepairInvoice(selectedJob.id),
                              "Invoice created, issued and linked automatically."
                            )
                          }
                        >
                          Create & Link Invoice
                        </Button>
                      </div>
                    </div>
                  )}

                {selectedJob.invoice_number && (
                  <div className={cardClass()}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold">Invoice & Payment</h3>
                        <p className="mt-1 font-semibold">{selectedJob.invoice_number}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Balance due: {money(selectedJob.balance_due)}
                        </p>
                      </div>
                      {Number(selectedJob.balance_due ?? 0) > 0.005 && can("invoice.payment") && (
                        <Link href="/invoices">
                          <Button variant="outline">Record Payment</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {selectedJob.status === "ready_for_collection" &&
                  can("repair.collection.confirm") && (
                    <div className={cardClass()}>
                      <h3 className="font-bold">Customer Collection</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Once the invoice is fully paid, confirm handover once. Nexus will then close the job automatically.
                      </p>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium">Collection confirmation method</span>
                          <select
                            className={fieldClass()}
                            value={collectionMethod}
                            onChange={(event) => setCollectionMethod(event.target.value)}
                          >
                            <option value="customer_signature">Customer signature</option>
                            <option value="otp">Customer OTP</option>
                            <option value="whatsapp">WhatsApp confirmation</option>
                          </select>
                        </label>

                        <label className="space-y-1.5 text-sm">
                          <span className="font-medium">Customer collection reference *</span>
                          <input
                            className={fieldClass()}
                            value={collectionReference}
                            onChange={(event) => setCollectionReference(event.target.value)}
                            placeholder="Signature / OTP / message reference"
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          disabled={busy}
                          className="bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => void collectJob()}
                        >
                          Confirm Collection & Close
                        </Button>
                      </div>
                    </div>
                  )}

                {selectedJob.status === "collected" && can("repair.close") && (
                  <div className={`${cardClass()} border-green-200 bg-green-50/30`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold">Owner Final Close</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Device collection and full invoice settlement must already be confirmed.
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={busy}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() =>
                          void runAction(
                            () => closeRepairJob(selectedJob.id),
                            "Job card closed successfully."
                          )
                        }
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Close Job Card
                      </Button>
                    </div>
                  </div>
                )}

                <div className={`${cardClass()} nexus-repair-audit-card`}>
                  <h3 className="font-bold">Job Audit Timeline</h3>
                  <div className="mt-4 space-y-3">
                    {jobEvents.length > 0 ? (
                      jobEvents.map((event) => (
                        <div key={event.id} className="flex gap-3 border-b pb-3 last:border-0 last:pb-0">
                          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />
                          <div>
                            <p className="text-sm font-semibold">{event.description}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {statusLabel(event.event_type)} · {dateTime(event.created_at)}
                              {typeof event.metadata?.handover_id === "string" && <span className="block break-all">Handover reference: {event.metadata.handover_id}</span>}
                              {typeof event.metadata?.signature_sha256 === "string" && <span className="block break-all">Signature SHA-256: {event.metadata.signature_sha256}</span>}
                              {typeof event.metadata?.reason === "string" && <span className="block">Verification note: {event.metadata.reason}</span>}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No job events available.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
