"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock3,
  Expand,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  Settings,
  XCircle,
} from "lucide-react";

import { supabase } from "@/lib/supabase";


type DeviceInfo = {
  ok: boolean;

  device_id: string;
  device_code: string;
  device_name: string;

  company_name: string;

  branch_id: string;
  branch_name: string;

  timezone: string;

  allowed_methods: string[];
};


type ClockResult = {
  ok: boolean;
  action: string;

  employee_id: string;
  employee_number: string;
  employee_name: string;

  occurred_at: string;
  work_date: string;

  shift_name?: string | null;
  late_minutes?: number;

  duration_minutes?: number;
};


const DEVICE_ID_KEY =
  "nexus_hr_kiosk_device_id";

const DEVICE_SECRET_KEY =
  "nexus_hr_kiosk_device_secret";


export default function HrKioskPage() {
  const badgeRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const pinRef =
    useRef<HTMLInputElement | null>(
      null
    );


  const [
    deviceId,
    setDeviceId,
  ] =
    useState(
      ""
    );

  const [
    deviceSecret,
    setDeviceSecret,
  ] =
    useState(
      ""
    );

  const [
    info,
    setInfo,
  ] =
    useState<DeviceInfo | null>(
      null
    );

  const [
    badge,
    setBadge,
  ] =
    useState(
      ""
    );

  const [
    pin,
    setPin,
  ] =
    useState(
      ""
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
    result,
    setResult,
  ] =
    useState<ClockResult | null>(
      null
    );

  const [
    now,
    setNow,
  ] =
    useState(
      new Date()
    );


  useEffect(
    () => {
      const timer =
        window.setInterval(
          () =>
            setNow(
              new Date()
            ),
          1000
        );


      return () =>
        window.clearInterval(
          timer
        );
    },
    []
  );


  async function verify(
    id:
      string,
    secret:
      string
  ) {
    const {
      data,
      error:
        rpcError,
    } =
      await supabase.rpc(
        "kiosk_get_device_info",
        {
          p_device_id:
            id,

          p_device_secret:
            secret,
        }
      );


    if (rpcError) {
      throw rpcError;
    }


    setInfo(
      data as DeviceInfo
    );


    setError(
      ""
    );


    window.setTimeout(
      () =>
        badgeRef.current?.focus(),
      100
    );
  }


  useEffect(
    () => {
      async function start() {
        const savedId =
          localStorage.getItem(
            DEVICE_ID_KEY
          ) ??
          "";

        const savedSecret =
          localStorage.getItem(
            DEVICE_SECRET_KEY
          ) ??
          "";


        setDeviceId(
          savedId
        );

        setDeviceSecret(
          savedSecret
        );


        if (
          savedId &&
          savedSecret
        ) {
          try {
            await verify(
              savedId,
              savedSecret
            );

          } catch (
            caught
          ) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Kiosk configuration is invalid."
            );
          }
        }


        setLoading(
          false
        );
      }


      void start();
    },
    []
  );


  async function saveConfiguration() {
    if (
      !deviceId ||
      !deviceSecret
    ) {
      setError(
        "Device ID and secret are required."
      );

      return;
    }


    setBusy(
      "setup"
    );

    setError(
      ""
    );


    try {
      await verify(
        deviceId,
        deviceSecret
      );


      localStorage.setItem(
        DEVICE_ID_KEY,
        deviceId
      );


      localStorage.setItem(
        DEVICE_SECRET_KEY,
        deviceSecret
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to verify attendance device."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function clearConfiguration() {
    const approved =
      window.confirm(
        "Remove the attendance kiosk configuration from this browser?"
      );


    if (!approved) {
      return;
    }


    localStorage.removeItem(
      DEVICE_ID_KEY
    );

    localStorage.removeItem(
      DEVICE_SECRET_KEY
    );


    setInfo(
      null
    );

    setDeviceId(
      ""
    );

    setDeviceSecret(
      ""
    );

    setBadge(
      ""
    );

    setPin(
      ""
    );

    setResult(
      null
    );
  }


  async function clock(
    action:
      "clock_in" |
      "clock_out"
  ) {
    if (
      !info ||
      !badge ||
      !pin
    ) {
      setError(
        "Enter your employee code and PIN."
      );

      return;
    }


    setBusy(
      action
    );

    setError(
      ""
    );

    setResult(
      null
    );


    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "kiosk_clock_hr_employee",
          {
            p_device_id:
              info.device_id,

            p_device_secret:
              deviceSecret,

            p_badge_code:
              badge.trim(),

            p_pin:
              pin,

            p_action:
              action,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setResult(
        data as ClockResult
      );


      setBadge(
        ""
      );

      setPin(
        ""
      );


      window.setTimeout(
        () => {
          setResult(
            null
          );

          badgeRef.current?.focus();
        },
        5000
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Attendance clock action failed."
      );


      setPin(
        ""
      );


      window.setTimeout(
        () =>
          pinRef.current?.focus(),
        100
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function clockDisplay() {
    const timezone =
      info?.timezone ??
      "Africa/Johannesburg";


    return new Intl.DateTimeFormat(
      "en-ZA",
      {
        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false,

        timeZone:
          timezone,
      }
    ).format(
      now
    );
  }


  function dateDisplay() {
    const timezone =
      info?.timezone ??
      "Africa/Johannesburg";


    return new Intl.DateTimeFormat(
      "en-ZA",
      {
        weekday:
          "long",

        day:
          "numeric",

        month:
          "long",

        year:
          "numeric",

        timeZone:
          timezone,
      }
    ).format(
      now
    );
  }


  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Starting Nexus Attendance...
        </p>
      </main>
    );
  }


  if (!info) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">

        <div className="w-full max-w-xl rounded-3xl border bg-background p-6 shadow-lg">

          <div className="flex items-center gap-3">

            <div className="rounded-2xl bg-foreground p-3 text-background">
              <MonitorSmartphone className="h-6 w-6" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                JINLAB Nexus
              </p>

              <h1 className="text-2xl font-bold">
                Attendance Kiosk Setup
              </h1>
            </div>

          </div>


          <p className="mt-5 text-sm text-muted-foreground">
            Register this device in HR → Attendance Devices, then enter the generated Device ID and secret here.
          </p>


          {error ? (
            <div className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <XCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          ) : null}


          <div className="mt-6 grid gap-4">

            <label className="grid gap-1.5 text-sm">

              <span className="font-medium">
                Device ID
              </span>

              <input
                value={
                  deviceId
                }
                onChange={
                  (
                    event
                  ) =>
                    setDeviceId(
                      event.target.value
                    )
                }
                className="h-12 rounded-xl border px-3"
              />

            </label>


            <label className="grid gap-1.5 text-sm">

              <span className="font-medium">
                Device Secret
              </span>

              <input
                type="password"
                value={
                  deviceSecret
                }
                onChange={
                  (
                    event
                  ) =>
                    setDeviceSecret(
                      event.target.value
                    )
                }
                className="h-12 rounded-xl border px-3"
              />

            </label>


            <button
              type="button"
              disabled={
                busy ===
                "setup"
              }
              onClick={
                () =>
                  void saveConfiguration()
              }
              className="h-12 rounded-xl bg-foreground px-5 font-bold text-background disabled:opacity-50"
            >
              Verify & Activate Kiosk
            </button>

          </div>

        </div>

      </main>
    );
  }


  return (
    <main className="min-h-screen bg-muted/20 p-4 sm:p-6">

      <div className="mx-auto max-w-5xl space-y-5">

        <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border bg-background p-5">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {info.company_name}
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              Employee Attendance
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              {info.branch_name} · {info.device_name}
            </p>

          </div>


          <div className="text-right">

            <p className="font-mono text-4xl font-bold tabular-nums">
              {clockDisplay()}
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {dateDisplay()}
            </p>

          </div>

        </header>


        {result ? (
          <div className="rounded-3xl border border-emerald-300 bg-emerald-50 p-8 text-center">

            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />

            <h2 className="mt-4 text-3xl font-bold text-emerald-900">
              {result.action ===
              "clock_in"
                ? "Clocked In"
                : "Clocked Out"}
            </h2>

            <p className="mt-2 text-xl font-semibold text-emerald-900">
              {result.employee_name}
            </p>

            <p className="mt-1 text-sm text-emerald-800">
              {result.employee_number}
            </p>


            {result.action ===
              "clock_in" &&
            typeof result.late_minutes ===
              "number" ? (
              <p className="mt-4 text-sm font-semibold text-emerald-900">
                {result.late_minutes >
                0
                  ? `Late by ${result.late_minutes} minute(s)`
                  : "On time"}
              </p>
            ) : null}


            {result.action ===
              "clock_out" &&
            typeof result.duration_minutes ===
              "number" ? (
              <p className="mt-4 text-sm font-semibold text-emerald-900">
                Worked approximately {Math.floor(
                  result.duration_minutes /
                  60
                )}h {result.duration_minutes %
                60}m
              </p>
            ) : null}

          </div>
        ) : (
          <section className="rounded-3xl border bg-background p-5 sm:p-8">

            <div className="mx-auto max-w-xl">

              <div className="text-center">

                <KeyRound className="mx-auto h-8 w-8 text-muted-foreground" />

                <h2 className="mt-3 text-xl font-bold">
                  Clock Yourself In or Out
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Enter or scan your employee badge, then enter your private PIN.
                </p>

              </div>


              {error ? (
                <div className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">

                  <XCircle className="h-5 w-5 shrink-0" />

                  {error}

                </div>
              ) : null}


              <div className="mt-7 grid gap-4">

                <label className="grid gap-1.5">

                  <span className="text-sm font-semibold">
                    Employee / Badge Code
                  </span>

                  <input
                    ref={
                      badgeRef
                    }
                    autoFocus
                    value={
                      badge
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setBadge(
                          event.target.value.toUpperCase()
                        )
                    }
                    onKeyDown={
                      (
                        event
                      ) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          pinRef.current?.focus();
                        }
                      }
                    }
                    placeholder="EMP-000001"
                    className="h-14 rounded-2xl border px-4 text-lg font-semibold uppercase"
                  />

                </label>


                <label className="grid gap-1.5">

                  <span className="text-sm font-semibold">
                    Private PIN
                  </span>

                  <input
                    ref={
                      pinRef
                    }
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={
                      pin
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPin(
                          event.target.value.replace(
                            /\D/g,
                            ""
                          )
                        )
                    }
                    className="h-14 rounded-2xl border px-4 text-center text-2xl font-bold tracking-[0.4em]"
                  />

                </label>


                <div className="grid gap-3 sm:grid-cols-2">

                  <button
                    type="button"
                    disabled={
                      Boolean(
                        busy
                      ) ||
                      !badge ||
                      !pin
                    }
                    onClick={
                      () =>
                        void clock(
                          "clock_in"
                        )
                    }
                    className="inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-foreground px-5 text-lg font-bold text-background disabled:opacity-40"
                  >
                    <LogIn className="h-6 w-6" />

                    CLOCK IN
                  </button>


                  <button
                    type="button"
                    disabled={
                      Boolean(
                        busy
                      ) ||
                      !badge ||
                      !pin
                    }
                    onClick={
                      () =>
                        void clock(
                          "clock_out"
                        )
                    }
                    className="inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border-2 px-5 text-lg font-bold disabled:opacity-40"
                  >
                    <LogOut className="h-6 w-6" />

                    CLOCK OUT
                  </button>

                </div>

              </div>


              <div className="mt-6 rounded-xl bg-muted/40 p-4 text-center text-xs text-muted-foreground">
                USB/Bluetooth barcode and QR scanners can enter the badge code directly. NFC hardware can later use the same employee identity.
              </div>

            </div>

          </section>
        )}


        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background p-4">

          <div className="flex items-center gap-2 text-xs text-muted-foreground">

            <Clock3 className="h-4 w-4" />

            Device {info.device_code} · Branch locked to {info.branch_name}

          </div>


          <div className="flex gap-2">

            <button
              type="button"
              onClick={
                () =>
                  void document.documentElement.requestFullscreen?.()
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
            >
              <Expand className="h-4 w-4" />
              Full Screen
            </button>


            <button
              type="button"
              onClick={
                () =>
                  void verify(
                    deviceId,
                    deviceSecret
                  )
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Check Device
            </button>


            <button
              type="button"
              onClick={
                clearConfiguration
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
            >
              <Settings className="h-4 w-4" />
              Reset Device
            </button>

          </div>

        </footer>

      </div>

    </main>
  );
}
