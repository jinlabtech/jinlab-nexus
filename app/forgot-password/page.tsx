"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const router =
    useRouter();

  const [email, setEmail] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [sent, setSent] =
    useState(false);

  const [error, setError] =
    useState("");

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      setError(
        "Enter your email address."
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const redirectTo =
        `${window.location.origin}/update-password`;

      const {
        error:
          recoveryError,
      } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo,
          }
        );

      if (recoveryError) {
        setError(
          recoveryError.message
        );
        return;
      }

      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/login"
            )
          }
          className="mb-7 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>

        <div className="rounded-2xl border bg-white p-6 sm:p-8">
          {!sent ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Mail className="h-6 w-6" />
              </div>

              <h1 className="mt-5 text-2xl font-bold text-slate-950">
                Forgot your password?
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter the email address used for
                your Nexus account. We&apos;ll
                send you a secure link to choose
                a new password.
              </p>

              <form
                onSubmit={submit}
                className="mt-7 space-y-5"
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">
                    Email address
                  </span>

                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(
                      event
                    ) =>
                      setEmail(
                        event.target
                          .value
                      )
                    }
                    placeholder="name@company.com"
                    className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                {error && (
                  <div
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busy && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}

                  Send recovery link
                </button>
              </form>
            </>
          ) : (
            <div className="py-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>

              <h1 className="mt-5 text-2xl font-bold text-slate-950">
                Check your email
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                If an account exists for{" "}
                <strong>
                  {email}
                </strong>
                , Nexus has sent a password
                recovery link.
              </p>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/login"
                  )
                }
                className="mt-6 h-11 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Return to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
