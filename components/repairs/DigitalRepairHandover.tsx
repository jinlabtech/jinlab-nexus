"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  CheckCircle2,
  Loader2,
  Mail,
  PenLine,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type Step =
  | "details"
  | "signature"
  | "otp"
  | "verified";

type HandoverDetails = {
  ok: boolean;
  handover_id: string;
  status: string;
  job_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  device: Record<string, unknown>;
  terms_version: number;
  terms_title: string;
  terms_text: string;
  signed_at: string | null;
  otp_verified_at: string | null;
  verified_at: string | null;
  verification_channel: string | null;
  receipt_number: string | null;
};

type ApiError = {
  error?: string;
  attemptsRemaining?: number | null;
};

type Props = {
  jobId: string;
  jobNumber: string;
  autoStart?: boolean;
  onAutoStartHandled?: () => void;
  onVerified?: () => void | Promise<void>;
};

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "Your Nexus session has expired. Please sign in again."
    );
  }

  return session.access_token;
}

async function apiPost<T>(
  url: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = await accessToken();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let result: T & ApiError;

  try {
    result = (await response.json()) as T & ApiError;
  } catch {
    throw new Error(
      "Nexus received an invalid response from the server."
    );
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
        "Nexus could not complete this handover action."
    );
  }

  return result;
}

export default function DigitalRepairHandover({
  jobId,
  jobNumber,
  autoStart = false,
  onAutoStartHandled,
  onVerified,
}: Props) {
  const [signatureView,setSignatureView]=useState<{url:string;signedAt:string;reference:string;sha256:string}|null>(null);
  const [inPersonReason,setInPersonReason]=useState("");
  const [customerPresent,setCustomerPresent]=useState(false);
  async function viewSignature(){setBusy(true);setError("");try{setSignatureView(await apiPost("/api/repairs/handover/signature/view",{jobId}));}catch(e){setError(e instanceof Error?e.message:"Signature unavailable.")}finally{setBusy(false)}}
  async function verifyInPerson(){if(!details)return;setBusy(true);setError("");try{
    const {data,error:failure}=await supabase.rpc("repair_verify_handover_in_person",{p_handover_id:details.handover_id,p_reason:inPersonReason,p_customer_present:customerPresent});
    if(failure)throw new Error(failure.message);
    setReceiptNumber(data.receipt_number||"");setDetails({...details,verification_channel:"in_person",verified_at:new Date().toISOString()});setStep("verified");setMessage("Customer verified in person. Staff identity and reason recorded in Job Audit.");await onVerified?.();
  }catch(e){setError(e instanceof Error?e.message:"In-person verification failed.")}finally{setBusy(false)}}
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const autoStartHandledRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] =
    useState<HandoverDetails | null>(null);

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [marketingEmail, setMarketingEmail] =
    useState(false);
  const [marketingSms, setMarketingSms] =
    useState(false);
  const [marketingWhatsApp, setMarketingWhatsApp] =
    useState(false);

  const [acceptedTerms, setAcceptedTerms] =
    useState(false);

  const [hasSignature, setHasSignature] =
    useState(false);

  const [otpId, setOtpId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpChannel, setOtpChannel] =
    useState<"sms" | "email" | "">("");
  const [destinationMasked, setDestinationMasked] =
    useState("");

  const [receiptNumber, setReceiptNumber] =
    useState("");
  const [receivedAt, setReceivedAt] =
    useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const begin = useCallback(async () => {
    setOpen(true);
    setBusy(true);
    setError("");
    setMessage("");
    setOtpCode("");
    setOtpId("");

    const {
      data,
      error: rpcError,
    } = await supabase.rpc(
      "repair_begin_intake_handover",
      {
        p_job_id: jobId,
      }
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const handover =
      data as HandoverDetails;

    setDetails(handover);

    const {
      data: jobDate,
      error: jobDateError,
    } = await supabase
      .from("service_job")
      .select("created_at")
      .eq("id", jobId)
      .maybeSingle();

    if (!jobDateError && jobDate?.created_at) {
      setReceivedAt(jobDate.created_at);
    }

    setPhone(
      handover.customer_phone ?? ""
    );

    setEmail(
      handover.customer_email ?? ""
    );

    setReceiptNumber(
      handover.receipt_number ?? ""
    );

    if (
      handover.status === "verified" ||
      handover.verified_at
    ) {
      setStep("verified");
      return;
    }

    if (
      handover.status === "awaiting_otp" &&
      handover.signed_at
    ) {
      setStep("otp");
      return;
    }

    setStep("details");
  }, [jobId]);

  useEffect(() => {
    if (!autoStart || autoStartHandledRef.current) {
      return;
    }

    autoStartHandledRef.current = true;

    void begin().finally(() => {
      onAutoStartHandled?.();
    });
  }, [
    autoStart,
    begin,
    onAutoStartHandled,
  ]);

  useEffect(() => {
    if (!autoStart) {
      autoStartHandledRef.current = false;
    }
  }, [autoStart]);

  async function saveContactAndContinue() {
    if (!details) return;

    if (!phone.trim() && !email.trim()) {
      setError(
        "Enter at least a mobile number or email address."
      );
      return;
    }

    if (!acceptedTerms) {
      setError(
        "The customer must read and accept the repair handover Terms & Conditions."
      );
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const {
      data,
      error: rpcError,
    } = await supabase.rpc(
      "repair_update_handover_contact",
      {
        p_handover_id:
          details.handover_id,
        p_phone:
          phone.trim() || null,
        p_email:
          email.trim() || null,
        p_marketing_email:
          marketingEmail,
        p_marketing_sms:
          marketingSms,
        p_marketing_whatsapp:
          marketingWhatsApp,
      }
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const updated = data as {
      phone?: string | null;
      email?: string | null;
    };

    if (updated?.phone) {
      setPhone(updated.phone);
    }

    if (updated?.email) {
      setEmail(updated.email);
    }

    setStep("signature");
  }

  useEffect(() => {
    if (
      !open ||
      step !== "signature"
    ) {
      return;
    }

    const frame =
      window.requestAnimationFrame(() => {
        const canvas =
          canvasRef.current;

        if (!canvas) return;

        const rect =
          canvas.getBoundingClientRect();

        const ratio =
          window.devicePixelRatio || 1;

        canvas.width =
          Math.max(
            Math.round(
              rect.width * ratio
            ),
            1
          );

        canvas.height =
          Math.max(
            Math.round(
              rect.height * ratio
            ),
            1
          );

        const ctx =
          canvas.getContext("2d");

        if (!ctx) return;

        ctx.setTransform(
          ratio,
          0,
          0,
          ratio,
          0,
          0
        );

        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#111827";

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(
          0,
          0,
          rect.width,
          rect.height
        );

        setHasSignature(false);
      });

    return () =>
      window.cancelAnimationFrame(frame);
  }, [open, step]);

  function pointerPosition(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    const rect =
      event.currentTarget.getBoundingClientRect();

    return {
      x:
        event.clientX -
        rect.left,
      y:
        event.clientY -
        rect.top,
    };
  }

  function startDrawing(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    const canvas =
      event.currentTarget;

    canvas.setPointerCapture(
      event.pointerId
    );

    const ctx =
      canvas.getContext("2d");

    if (!ctx) return;

    const point =
      pointerPosition(event);

    drawingRef.current = true;

    ctx.beginPath();
    ctx.moveTo(
      point.x,
      point.y
    );
  }

  function draw(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    if (!drawingRef.current) {
      return;
    }

    const ctx =
      event.currentTarget.getContext("2d");

    if (!ctx) return;

    const point =
      pointerPosition(event);

    ctx.lineTo(
      point.x,
      point.y
    );

    ctx.stroke();

    setHasSignature(true);
  }

  function stopDrawing(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }

    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas =
      canvasRef.current;

    if (!canvas) return;

    const rect =
      canvas.getBoundingClientRect();

    const ctx =
      canvas.getContext("2d");

    if (!ctx) return;

    ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
      0,
      0,
      rect.width,
      rect.height
    );

    setHasSignature(false);
  }

  async function submitSignature() {
    if (!details) return;

    const canvas =
      canvasRef.current;

    if (!canvas || !hasSignature) {
      setError(
        "Please ask the customer to sign inside the signature box."
      );
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await apiPost<{
        ok: boolean;
        status: string;
      }>(
        "/api/repairs/handover/signature",
        {
          handoverId:
            details.handover_id,
          imageDataUrl:
            canvas.toDataURL(
              "image/png"
            ),
        }
      );

      setDetails(current=>current?{...current,signed_at:new Date().toISOString()}:current);
      setStep("otp");
      setMessage(
        "Signature securely saved. Send the customer a verification code."
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save the customer signature."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp(
    channel: "sms" | "email"
  ) {
    if (!details) return;

    setBusy(true);
    setError("");
    setMessage("");
    setOtpCode("");

    try {
      const result =
        await apiPost<{
          ok: boolean;
          otpId: string;
          channel: "sms" | "email";
          destinationMasked: string;
          expiresAt: string;
          attemptsAllowed: number;
        }>(
          "/api/repairs/handover/otp/send",
          {
            handoverId:
              details.handover_id,
            channel,
          }
        );

      setOtpId(
        result.otpId
      );

      setOtpChannel(
        result.channel
      );

      setDestinationMasked(
        result.destinationMasked
      );

      setMessage(
        `Verification code sent to ${result.destinationMasked}.`
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not send the verification code."
      );
    } finally {
      setBusy(false);
    }
  }

  function textValue(
    value: unknown
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    return String(value);
  }

  function escapeHtml(
    value: unknown
  ) {
    return textValue(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formattedDate(
    value: string | null
  ) {
    if (!value) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "en-ZA",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(
      new Date(value)
    );
  }

  function printSlip() {
    if (!details) return;

    const device =
      details.device ?? {};

    const slip =
      window.open(
        "",
        "_blank",
        "width=820,height=900"
      );

    if (!slip) {
      setError(
        "Your browser blocked the print window. Allow pop-ups for Nexus and try again."
      );
      return;
    }

    const receipt =
      receiptNumber ||
      details.receipt_number ||
      `${details.job_number}-INTAKE`;

    const verified =
      details.verified_at ||
      new Date().toISOString();

    slip.document.open();

    slip.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(receipt)}</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f4f6f8;
      color: #111827;
      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    .page {
      width: 190mm;
      min-height: 260mm;
      margin: 12mm auto;
      background: #ffffff;
      padding: 14mm;
      border: 1px solid #d1d5db;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 3px solid #111827;
      padding-bottom: 14px;
    }

    .brand {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .subtitle {
      margin-top: 4px;
      color: #4b5563;
      font-size: 13px;
      font-weight: 700;
    }

    .receipt {
      text-align: right;
      font-size: 12px;
      color: #4b5563;
    }

    .receipt strong {
      display: block;
      margin-top: 4px;
      color: #111827;
      font-size: 16px;
    }

    .verified {
      margin-top: 16px;
      border: 1px solid #86efac;
      background: #f0fdf4;
      padding: 12px;
      font-size: 13px;
      font-weight: 700;
    }

    .section {
      margin-top: 20px;
    }

    .section-title {
      margin-bottom: 8px;
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 6px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 22px;
    }

    .field {
      font-size: 13px;
    }

    .label {
      display: block;
      margin-bottom: 3px;
      color: #6b7280;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .value {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .full {
      grid-column: 1 / -1;
    }

    .notice {
      margin-top: 20px;
      border: 1px solid #d1d5db;
      padding: 12px;
      color: #374151;
      font-size: 11px;
      line-height: 1.55;
    }

    .footer {
      margin-top: 26px;
      border-top: 1px solid #d1d5db;
      padding-top: 10px;
      color: #6b7280;
      font-size: 10px;
      line-height: 1.5;
    }

    .actions {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 14px;
      background: rgba(255,255,255,.96);
      border-top: 1px solid #d1d5db;
    }

    button {
      cursor: pointer;
      border: 0;
      border-radius: 7px;
      padding: 10px 18px;
      font-weight: 700;
    }

    .print {
      background: #111827;
      color: white;
    }

    .close {
      background: #e5e7eb;
      color: #111827;
    }

    @media print {
      body {
        background: white;
      }

      .page {
        width: auto;
        min-height: auto;
        margin: 0;
        border: 0;
        padding: 8mm;
      }

      .actions {
        display: none;
      }

      @page {
        size: A4;
        margin: 10mm;
      }
    }
  </style>
</head>

<body>
  <main class="page">
    <header class="header">
      <div>
        <div class="brand">
          JINLAB
        </div>

        <div class="subtitle">
          REPAIR DEVICE HANDOVER RECEIPT
        </div>
      </div>

      <div class="receipt">
        Receipt
        <strong>
          ${escapeHtml(receipt)}
        </strong>
      </div>
    </header>

    <div class="verified">
      ✓ DIGITAL HANDOVER VERIFIED —
      Customer terms acceptance, signature and verification method recorded by JINLAB Nexus.
    </div>

    <section class="section">
      <div class="section-title">
        Job Card
      </div>

      <div class="grid">
        <div class="field">
          <span class="label">Job Card Number</span>
          <span class="value">
            ${escapeHtml(details.job_number)}
          </span>
        </div>

        <div class="field">
          <span class="label">Received</span>
          <span class="value">
            ${escapeHtml(formattedDate(receivedAt))}
          </span>
        </div>

        <div class="field">
          <span class="label">Handover Verified</span>
          <span class="value">
            ${escapeHtml(formattedDate(verified))}
          </span>
        </div>

        <div class="field">
          <span class="label">Verification Channel</span>
          <span class="value">
            ${escapeHtml(
              details.verification_channel ||
              (details?.verification_channel === "in_person" ? "Verified in person" : otpChannel) ||
              "OTP"
            )}
          </span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        Customer
      </div>

      <div class="grid">
        <div class="field">
          <span class="label">Customer Name</span>
          <span class="value">
            ${escapeHtml(details.customer_name)}
          </span>
        </div>

        <div class="field">
          <span class="label">Mobile Number</span>
          <span class="value">
            ${escapeHtml(phone)}
          </span>
        </div>

        <div class="field full">
          <span class="label">Email Address</span>
          <span class="value">
            ${escapeHtml(email)}
          </span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        Device Received
      </div>

      <div class="grid">
        <div class="field">
          <span class="label">Device Type</span>
          <span class="value">
            ${escapeHtml(device.device_type)}
          </span>
        </div>

        <div class="field">
          <span class="label">Brand</span>
          <span class="value">
            ${escapeHtml(device.brand)}
          </span>
        </div>

        <div class="field">
          <span class="label">Model</span>
          <span class="value">
            ${escapeHtml(device.model)}
          </span>
        </div>

        <div class="field">
          <span class="label">Serial Number</span>
          <span class="value">
            ${escapeHtml(device.serial_number)}
          </span>
        </div>

        <div class="field">
          <span class="label">IMEI</span>
          <span class="value">
            ${escapeHtml(device.imei)}
          </span>
        </div>

        <div class="field">
          <span class="label">Condition</span>
          <span class="value">
            ${escapeHtml(device.device_condition)}
          </span>
        </div>

        <div class="field full">
          <span class="label">Accessories Received</span>
          <span class="value">
            ${escapeHtml(device.accessories_received)}
          </span>
        </div>

        <div class="field full">
          <span class="label">Reported Fault</span>
          <span class="value">
            ${escapeHtml(device.reported_fault)}
          </span>
        </div>
      </div>
    </section>

    <section class="notice">
      <strong>Customer Handover Confirmation</strong><br />
      This receipt confirms that the device and listed accessories were received
      for the Job Card shown above. The customer accepted Repair Handover Terms
      version ${escapeHtml(details.terms_version)}, supplied a digital signature,
      and completed one-time-code verification. This receipt is not itself a
      quotation or approval for additional chargeable repair work.
    </section>

    <footer class="footer">
      Generated by JINLAB Nexus.<br />
      Receipt reference:
      ${escapeHtml(receipt)}
      · Job Card:
      ${escapeHtml(details.job_number)}
    </footer>
  </main>

  <div class="actions">
    <button
      class="print"
      onclick="window.print()"
    >
      Print / Save PDF
    </button>

    <button
      class="close"
      onclick="window.close()"
    >
      Close
    </button>
  </div>
</body>
</html>
    `);

    slip.document.close();
    slip.focus();
  }

  async function verifyOtp() {
    if (
      !otpId ||
      !/^\d{6}$/.test(
        otpCode.trim()
      )
    ) {
      setError(
        "Enter the 6-digit verification code."
      );
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result =
        await apiPost<{
          ok: boolean;
          receiptNumber:
            | string
            | null;
          jobNumber:
            | string
            | null;
          verifiedAt:
            | string
            | null;
        }>(
          "/api/repairs/handover/otp/verify",
          {
            otpId,
            code:
              otpCode.trim(),
          }
        );

      setReceiptNumber(
        result.receiptNumber ||
          details?.receipt_number ||
          ""
      );

      setStep("verified");

      setMessage(
        "Device handover verified successfully."
      );

      await onVerified?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Verification failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-blue-200 bg-muted/40 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />

              <h3 className="font-bold">
                1. Digital Device Handover
              </h3>
            </div>

            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Confirm customer details, Terms & Conditions,
              signature and customer verification before diagnosis begins.
            </p>
          </div>

          <Button
            type="button"
            onClick={() =>
              void begin()
            }
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <PenLine className="mr-2 h-4 w-4" />
            Start Handover
          </Button>
        </div>
      </div>

      {signatureView && <div role="dialog" aria-label="Saved customer signature" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-xl space-y-3 rounded-2xl border bg-background p-5 text-foreground"><div className="flex justify-between"><h3 className="font-semibold">Signature: Captured</h3><Button onClick={()=>setSignatureView(null)}>Close</Button></div><p className="text-sm">Signed {new Date(signatureView.signedAt).toLocaleString()}</p>{ /* Private, expiring image URL is intentionally not passed through an image optimizer. */}
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={signatureView.url} alt="Customer’s saved signature" className="max-h-64 w-full rounded border bg-white object-contain"/><p className="break-all text-xs">Reference: {signatureView.reference}<br/>SHA-256: {signatureView.sha256}</p><p className="text-xs text-muted-foreground">Private link expires after two minutes. Close and reopen to renew.</p></div></div>}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-5">
          <div className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background text-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                  JINLAB Nexus Digital Handover
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {jobNumber}
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Customer device intake verification
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="rounded-lg border p-2 hover:bg-muted"
                aria-label="Close digital handover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-muted p-3 text-sm"><span>{details?.signed_at ? `Signature: Captured · ${new Date(details.signed_at).toLocaleString()}` : "Signature record"}</span><Button type="button" variant="outline" disabled={busy} onClick={()=>void viewSignature()}>View saved signature</Button>{details?.handover_id&&<span className="break-all text-xs text-muted-foreground">Reference: {details.handover_id}</span>}</div>
              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {message && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {message}
                </div>
              )}

              {busy && !details && (
                <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Preparing digital handover...
                </div>
              )}

              {details && step === "details" && (
                <div className="space-y-5">
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Customer
                    </p>

                    <p className="mt-1 text-lg font-bold">
                      {details.customer_name}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm">
                      <span className="font-semibold">
                        Mobile number
                      </span>

                      <input
                        className="h-11 w-full rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground px-3 outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        value={phone}
                        onChange={(event) =>
                          setPhone(
                            event.target.value
                          )
                        }
                        placeholder="e.g. 082 123 4567"
                      />

                      <span className="block text-xs text-muted-foreground">
                        Used for repair SMS and verification.
                      </span>
                    </label>

                    <label className="space-y-1.5 text-sm">
                      <span className="font-semibold">
                        Email address
                      </span>

                      <input
                        type="email"
                        className="h-11 w-full rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground px-3 outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        value={email}
                        onChange={(event) =>
                          setEmail(
                            event.target.value
                          )
                        }
                        placeholder="Optional if mobile is available"
                      />

                      <span className="block text-xs text-muted-foreground">
                        Saved to the customer profile for repair communication.
                      </span>
                    </label>
                  </div>

                  <div className="rounded-xl border p-4">
                    <p className="font-semibold">
                      Optional marketing consent
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      These choices are separate from repair notifications
                      and are not required for service.
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={
                            marketingSms
                          }
                          disabled={
                            !phone.trim()
                          }
                          onChange={(event) =>
                            setMarketingSms(
                              event.target.checked
                            )
                          }
                        />

                        <span>
                          SMS offers
                        </span>
                      </label>

                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={
                            marketingWhatsApp
                          }
                          disabled={
                            !phone.trim()
                          }
                          onChange={(event) =>
                            setMarketingWhatsApp(
                              event.target.checked
                            )
                          }
                        />

                        <span>
                          WhatsApp offers
                        </span>
                      </label>

                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={
                            marketingEmail
                          }
                          disabled={
                            !email.trim()
                          }
                          onChange={(event) =>
                            setMarketingEmail(
                              event.target.checked
                            )
                          }
                        />

                        <span>
                          Email offers
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-xl border">
                    <div className="border-b px-4 py-3">
                      <p className="font-bold">
                        {details.terms_title}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Version {details.terms_version}
                      </p>
                    </div>

                    <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-muted-foreground">
                      {details.terms_text}
                    </div>
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-blue-200 bg-muted/40 p-4">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={
                        acceptedTerms
                      }
                      onChange={(event) =>
                        setAcceptedTerms(
                          event.target.checked
                        )
                      }
                    />

                    <span className="text-sm">
                      <strong>
                        Customer confirmation:
                      </strong>{" "}
                      I confirm the device and accessories handed
                      in are correctly recorded, and I have read
                      and accept these repair handover Terms &
                      Conditions.
                    </span>
                  </label>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void saveContactAndContinue()
                      }
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {busy && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Continue to Signature
                    </Button>
                  </div>
                </div>
              )}

              {details && step === "signature" && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <PenLine className="h-5 w-5 text-blue-600" />

                      <h3 className="text-lg font-bold">
                        Customer Signature
                      </h3>
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Hand the device to the customer. They can sign
                      below using a finger, stylus or mouse.
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white">
                    <canvas
                      ref={canvasRef}
                      className="h-64 w-full cursor-crosshair touch-none bg-white"
                      onPointerDown={
                        startDrawing
                      }
                      onPointerMove={
                        draw
                      }
                      onPointerUp={
                        stopDrawing
                      }
                      onPointerCancel={
                        stopDrawing
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        clearSignature
                      }
                    >
                      Clear Signature
                    </Button>

                    <Button
                      type="button"
                      disabled={
                        busy ||
                        !hasSignature
                      }
                      onClick={() =>
                        void submitSignature()
                      }
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {busy && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Signature & Continue
                    </Button>
                  </div>
                </div>
              )}

              {details && step === "otp" && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-blue-600" />

                      <h3 className="text-lg font-bold">
                        Customer Verification
                      </h3>
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Send a one-time verification code to the
                      customer. The code expires after 5 minutes.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !phone.trim()
                      }
                      onClick={() =>
                        void sendOtp("sms")
                      }
                      className="rounded-xl border p-4 text-left transition hover:border-blue-400 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Smartphone className="h-5 w-5 text-blue-600" />

                      <p className="mt-3 font-bold">
                        Send by SMS
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {phone ||
                          "No mobile number"}
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy ||
                        !email.trim()
                      }
                      onClick={() =>
                        void sendOtp("email")
                      }
                      className="rounded-xl border p-4 text-left transition hover:border-blue-400 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Mail className="h-5 w-5 text-blue-600" />

                      <p className="mt-3 font-bold">
                        Send by Email (recommended)
                      </p>

                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {email ||
                          "No email address"}
                      </p>
                    </button>
                  </div>

                  <div className="rounded-xl border border-dashed p-4 opacity-70">
                    <p className="text-sm font-semibold">
                      WhatsApp verification
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Coming through the approved Meta authentication
                      template. Nexus will not use an unreliable
                      free-reply WhatsApp message for OTP delivery.
                    </p>
                  </div>

                  <details className="rounded-xl border bg-muted/30 p-4"><summary className="cursor-pointer font-semibold">Customer at the counter? Verify in person</summary><p className="mt-3 text-sm text-muted-foreground">For authorised intake staff when a customer is physically present. Their signed terms remain required. Your identity, time and reason are recorded in Job Audit. Do not enter identity-document numbers.</p><label className="mt-3 block text-sm">How was identity checked, and why is this fallback needed?<textarea className="mt-1 w-full rounded-lg border bg-background p-3 text-foreground" maxLength={1000} value={inPersonReason} onChange={e=>setInPersonReason(e.target.value)} disabled={busy}/></label><label className="my-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={customerPresent} onChange={e=>setCustomerPresent(e.target.checked)} disabled={busy}/>I checked the customer’s identity in person and witnessed their signature.</label><Button type="button" disabled={busy||!customerPresent||inPersonReason.trim().length<10} onClick={()=>void verifyInPerson()}>Record in-person verification</Button></details>
                  {otpId && (
                    <div className="rounded-xl border bg-muted/20 p-5">
                      <p className="font-semibold">
                        Enter verification code
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Sent by{" "}
                        {otpChannel === "sms"
                          ? "SMS"
                          : "email"}{" "}
                        to {destinationMasked}.
                      </p>

                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onChange={(event) =>
                          setOtpCode(
                            event.target.value.replace(
                              /\D/g,
                              ""
                            )
                          )
                        }
                        placeholder="000000"
                        className="mt-4 h-14 w-full rounded-xl border bg-background px-4 text-center text-2xl font-bold tracking-[0.35em] outline-none focus:ring-2 focus:ring-blue-500"
                      />

                      <Button
                        type="button"
                        disabled={
                          busy ||
                          otpCode.length !==
                            6
                        }
                        onClick={() =>
                          void verifyOtp()
                        }
                        className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {busy && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Verify & Confirm Handover
                      </Button>

                      <p className="mt-3 text-center text-xs text-muted-foreground">
                        A new code can be requested after the
                        resend waiting period.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {details && step === "verified" && (
                <div className="py-8 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
                    <CheckCircle2 className="h-9 w-9" />
                  </div>

                  <h3 className="mt-5 text-2xl font-bold">
                    Handover Verified
                  </h3>

                  <p className="mt-2 text-sm text-muted-foreground">
                    The customer signature and verification code
                    have been recorded successfully.
                  </p>

                  <div className="mx-auto mt-6 max-w-sm rounded-xl border bg-muted/20 p-4 text-left">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Job Card
                      </span>

                      <strong>
                        {details.job_number}
                      </strong>
                    </div>

                    <div className="mt-3 flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Handover receipt
                      </span>

                      <strong>
                        {receiptNumber ||
                          details.receipt_number ||
                          "Issued"}
                      </strong>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={printSlip}
                    >
                      Print / Save PDF
                    </Button>

                    <Button
                      type="button"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => {
                        setOpen(false);
                        void onVerified?.();
                      }}
                    >
                      Return to Job Card
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
