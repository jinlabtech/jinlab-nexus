"use client";

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const router =
    useRouter();

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    sessionReady,
    setSessionReady,
  ] = useState(false);

  const [
    checking,
    setChecking,
  ] = useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [updated, setUpdated] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSessionReady(
          Boolean(
            data.session
          )
        );

        setChecking(false);
      });

    const {
      data:
        listener,
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          session
        ) => {
          if (!mounted) {
            return;
          }

          if (
            event ===
              "PASSWORD_RECOVERY" ||
            session
          ) {
            setSessionReady(
              true
            );

            setChecking(
              false
            );
          }
        }
      );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (
      password.length < 8
    ) {
      setError(
        "Use at least 8 characters for your new password."
      );
      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        "The two passwords do not match."
      );
      return;
    }

    setBusy(true);

    try {
      const {
        error:
          updateError,
      } =
        await supabase.auth.updateUser(
          {
            password,
          }
        );

      if (updateError) {
        setError(
          updateError.message
        );
        return;
      }

      setUpdated(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 sm:p-8">
        {checking ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Verifying recovery link...
          </div>
        ) : updated ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <h1 className="mt-5 text-2xl font-bold">
              Password updated
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your new password is active. You
              can now return to Nexus.
            </p>

            <button
              type="button"
              onClick={() =>
                router.replace(
                  "/dashboard"
                )
              }
              className="mt-6 h-11 rounded-xl bg-slate-950 px-6 font-semibold text-white hover:bg-slate-800"
            >
              Continue to Nexus
            </button>
          </div>
        ) : !sessionReady ? (
          <div className="py-4 text-center">
            <LockKeyhole className="mx-auto h-10 w-10 text-slate-400" />

            <h1 className="mt-4 text-xl font-bold">
              Recovery link unavailable
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This recovery link may be invalid
              or expired. Request a fresh one
              from the sign-in screen.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/forgot-password"
                )
              }
              className="mt-6 h-11 rounded-xl bg-slate-950 px-5 font-semibold text-white"
            >
              Request new link
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <LockKeyhole className="h-6 w-6" />
            </div>

            <h1 className="mt-5 text-2xl font-bold">
              Choose a new password
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create a new password for your
              JINLAB Nexus account.
            </p>

            <form
              onSubmit={
                updatePassword
              }
              className="mt-7 space-y-5"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">
                  New password
                </span>

                <div className="relative">
                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="new-password"
                    value={
                      password
                    }
                    onChange={(
                      event
                    ) =>
                      setPassword(
                        event.target
                          .value
                      )
                    }
                    className="h-12 w-full rounded-xl border border-slate-300 px-3 pr-11 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (value) =>
                          !value
                      )
                    }
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">
                  Confirm password
                </span>

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  value={
                    confirmPassword
                  }
                  onChange={(
                    event
                  ) =>
                    setConfirmPassword(
                      event.target
                        .value
                    )
                  }
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

                Save new password
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
