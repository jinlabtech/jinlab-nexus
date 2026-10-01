"use client";

import {
  CheckCircle2,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type CompletionState =
  | "loading"
  | "no-workspace"
  | "error";

export default function AuthCompletePage() {
  const router =
    useRouter();

  const [
    state,
    setState,
  ] =
    useState<CompletionState>(
      "loading"
    );

  const [message, setMessage] =
    useState(
      "Securing your Nexus session..."
    );

  const [email, setEmail] =
    useState("");

  useEffect(() => {
    let active = true;

    async function finish() {
      try {
        const url =
          new URL(
            window.location.href
          );

        const queryError =
          url.searchParams.get(
            "error_description"
          );

        const hashParams =
          new URLSearchParams(
            window.location.hash.replace(
              /^#/,
              ""
            )
          );

        const hashError =
          hashParams.get(
            "error_description"
          );

        if (
          queryError ||
          hashError
        ) {
          if (!active) {
            return;
          }

          setMessage(
            queryError ||
              hashError ||
              "Authentication failed."
          );

          setState(
            "error"
          );

          return;
        }

        const code =
          url.searchParams.get(
            "code"
          );

        if (code) {
          const {
            error:
              exchangeError,
          } =
            await supabase.auth.exchangeCodeForSession(
              code
            );

          if (
            exchangeError &&
            !exchangeError.message
              .toLowerCase()
              .includes(
                "code verifier"
              )
          ) {
            throw exchangeError;
          }
        }

        let {
          data:
            sessionData,
        } =
          await supabase.auth.getSession();

        if (
          !sessionData.session
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                800
              )
          );

          const retry =
            await supabase.auth.getSession();

          sessionData =
            retry.data;
        }

        const user =
          sessionData.session?.user;

        if (!user) {
          throw new Error(
            "We could not create your Nexus session. Please sign in again."
          );
        }

        if (!active) {
          return;
        }

        setEmail(
          user.email ?? ""
        );

        setMessage(
          "Checking your organisation access..."
        );

        const {
          data:
            membership,
          error:
            profileError,
        } =
          await supabase
            .from(
              "user_profile"
            )
            .select(
              "user_id, company_id, role"
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (
          membership?.company_id
        ) {
          router.replace(
            "/dashboard"
          );

          router.refresh();

          return;
        }

        if (!active) {
          return;
        }

        setState(
          "no-workspace"
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Authentication could not be completed."
        );

        setState(
          "error"
        );
      }
    }

    void finish();

    return () => {
      active = false;
    };
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );

    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {state ===
        "loading" ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>

            <h1 className="mt-5 text-2xl font-bold">
              Connecting to Nexus
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              {message}
            </p>
          </>
        ) : state ===
          "no-workspace" ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <h1 className="mt-5 text-2xl font-bold">
              Account verified
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              {email
                ? `${email} is authenticated successfully.`
                : "Your account is authenticated successfully."}
            </p>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Workspace access required
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Your Nexus identity exists,
                    but an organisation
                    administrator still needs to
                    assign this account to a
                    workspace.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void signOut()
              }
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <ShieldCheck className="h-7 w-7" />
            </div>

            <h1 className="mt-5 text-2xl font-bold">
              Sign-in could not finish
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              {message}
            </p>

            <button
              type="button"
              onClick={() =>
                router.replace(
                  "/login"
                )
              }
              className="mt-6 h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
            >
              Return to sign in
            </button>
          </>
        )}
      </div>
    </main>
  );
}
