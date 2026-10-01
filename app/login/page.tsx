"use client";

import {
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ReceiptText,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type SocialProvider =
  | "google"
  | "apple";

function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.34 2.98-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.94A6.01 6.01 0 0 1 6.1 12c0-.67.12-1.32.31-1.94V7.44H3.07A10 10 0 0 0 2 12c0 1.61.38 3.14 1.07 4.56l3.34-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.79.5 3.83 1.49l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.93 5.44l3.34 2.62C7.2 7.7 9.4 5.94 12 5.94Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16.72 12.72c-.02-2.15 1.76-3.19 1.84-3.24a3.98 3.98 0 0 0-3.13-1.69c-1.32-.14-2.6.79-3.27.79-.68 0-1.71-.78-2.82-.76a4.15 4.15 0 0 0-3.5 2.13c-1.52 2.63-.39 6.5 1.07 8.63.73 1.04 1.58 2.2 2.69 2.16 1.09-.04 1.5-.69 2.82-.69 1.3 0 1.69.69 2.83.66 1.17-.02 1.91-1.04 2.61-2.09.84-1.19 1.18-2.36 1.19-2.42-.03-.01-2.3-.88-2.33-3.48ZM14.57 6.39c.58-.73.98-1.72.86-2.72-.84.04-1.9.58-2.5 1.29-.53.63-1 1.66-.86 2.62.95.07 1.91-.48 2.5-1.19Z"
      />
    </svg>
  );
}

const features = [
  {
    icon: Building2,
    label: "Operations",
  },
  {
    icon: Boxes,
    label: "Inventory",
  },
  {
    icon: Wrench,
    label: "Repairs",
  },
  {
    icon: ReceiptText,
    label: "Finance",
  },
  {
    icon: Users,
    label: "People",
  },
];

export default function LoginPage() {
  const router =
    useRouter();

  const [email, setEmail] =
    useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [busy, setBusy] =
    useState(false);

  const [
    socialBusy,
    setSocialBusy,
  ] =
    useState<SocialProvider | null>(
      null
    );

  const [message, setMessage] =
    useState("");

  const [
    messageType,
    setMessageType,
  ] =
    useState<
      "error" | "success" | ""
    >("");

  function clearMessage() {
    setMessage("");
    setMessageType("");
  }

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanEmail =
      email.trim().toLowerCase();

    if (
      !cleanEmail ||
      !password
    ) {
      setMessageType("error");
      setMessage(
        "Enter your email address and password."
      );
      return;
    }

    setBusy(true);
    clearMessage();

    try {
      const { error } =
        await supabase.auth.signInWithPassword(
          {
            email:
              cleanEmail,
            password,
          }
        );

      if (error) {
        setMessageType(
          "error"
        );

        setMessage(
          "We could not sign you in. Check your details or reset your password."
        );

        return;
      }

      setMessageType(
        "success"
      );

      setMessage(
        "Secure sign-in successful."
      );

      router.replace(
        "/dashboard"
      );

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function socialLogin(
    provider: SocialProvider
  ) {
    clearMessage();
    setSocialBusy(provider);

    try {
      await supabase.auth.signOut({
        scope: "local",
      });

      const redirectTo =
        `${window.location.origin}/auth/complete`;

      const result =
        provider === "google"
          ? await supabase.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo,
                skipBrowserRedirect: true,
                scopes:
                  "openid email profile",
                queryParams: {
                  prompt:
                    "select_account",
                },
              },
            })
          : await supabase.auth.signInWithOAuth({
              provider: "apple",
              options: {
                redirectTo,
                skipBrowserRedirect: true,
              },
            });

      if (result.error) {
        throw result.error;
      }

      if (!result.data.url) {
        throw new Error(
          "Authentication URL was not returned."
        );
      }

      window.location.assign(
        result.data.url
      );
    } catch (error) {
      const providerName =
        provider === "google"
          ? "Google"
          : "Apple";

      setMessageType("error");

      setMessage(
        error instanceof Error
          ? `${providerName} sign-in could not start: ${error.message}`
          : `${providerName} sign-in could not start.`
      );

      setSocialBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(37,99,235,0.22),transparent_34%),radial-gradient(circle_at_90%_90%,rgba(59,130,246,0.12),transparent_28%)]" />

        <div className="absolute right-[-120px] top-[-120px] h-[420px] w-[420px] rounded-full border border-white/5" />
        <div className="absolute right-[-60px] top-[-60px] h-[300px] w-[300px] rounded-full border border-white/5" />

        <div className="relative z-10 p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lg font-black tracking-tight text-slate-950">
              J
            </div>

            <div>
              <div className="text-lg font-extrabold tracking-[0.12em] text-white">
                JINLAB
              </div>

              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-400">
                Nexus
              </div>
            </div>
          </div>

          <div className="mt-24 max-w-2xl xl:mt-32">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300">
              <ShieldCheck className="h-4 w-4" />
              Secure business workspace
            </div>

            <h1 className="mt-7 max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.04em] text-white xl:text-6xl">
              Run your business from one intelligent platform.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 xl:text-lg">
              JINLAB Nexus connects your
              operations, customers, inventory,
              repairs, finance and people into one
              secure workspace.
            </p>

            <div className="mt-10 flex flex-wrap gap-2.5">
              {features.map(
                ({
                  icon: Icon,
                  label,
                }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm font-medium text-slate-300"
                  >
                    <Icon className="h-4 w-4 text-blue-400" />
                    {label}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between gap-6 border-t border-white/10 px-12 py-8 text-xs text-slate-500 xl:px-16">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            Protected by JINLAB Nexus Security
          </div>

          <span>
            Enterprise access
          </span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
        <div className="w-full max-w-[460px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-base font-black text-white">
              J
            </div>

            <div>
              <div className="font-extrabold tracking-wide">
                JINLAB Nexus
              </div>

              <div className="text-xs text-slate-500">
                Business Operating System
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.28)] sm:p-8">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
                <CheckCircle2 className="h-4 w-4" />
                Secure access
              </div>

              <h2 className="mt-3 text-[30px] font-bold tracking-[-0.035em] text-slate-950 sm:text-[34px]">
                Welcome back
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sign in to your JINLAB Nexus
                workspace.
              </p>
            </div>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                disabled={
                  socialBusy !== null ||
                  busy
                }
                onClick={() =>
                  void socialLogin(
                    "google"
                  )
                }
                className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {socialBusy ===
                "google" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}

                Continue with Google
              </button>

              <button
                type="button"
                disabled={
                  socialBusy !== null ||
                  busy
                }
                onClick={() =>
                  void socialLogin(
                    "apple"
                  )
                }
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {socialBusy ===
                "apple" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <AppleIcon />
                )}

                Continue with Apple
              </button>
            </div>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />

              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                or
              </span>

              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form
              onSubmit={
                handleLogin
              }
              className="space-y-5"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Email address
                </span>

                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                  <input
                    type="email"
                    value={email}
                    required
                    autoComplete="email"
                    inputMode="email"
                    placeholder="name@company.com"
                    onChange={(
                      event
                    ) => {
                      setEmail(
                        event.target
                          .value
                      );
                      clearMessage();
                    }}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </label>

              <label className="block">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-slate-700">
                    Password
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        "/forgot-password"
                      )
                    }
                    className="rounded-md text-sm font-semibold text-blue-600 outline-none transition hover:text-blue-700 focus:ring-2 focus:ring-blue-500/20"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      password
                    }
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    onChange={(
                      event
                    ) => {
                      setPassword(
                        event.target
                          .value
                      );
                      clearMessage();
                    }}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />

                  <button
                    type="button"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current
                      )
                    }
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </div>
              </label>

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={
                    messageType ===
                    "success"
                      ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-700"
                      : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
                  }
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  busy ||
                  socialBusy !== null
                }
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Sign in to Nexus
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

          <div className="mt-6 text-center">
            <span className="text-sm text-slate-500">
              New to JINLAB Nexus?{" "}
            </span>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/signup"
                )
              }
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              Create an account
            </button>
          </div>

            <div className="mt-7 border-t border-slate-100 pt-5">
              <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3.5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    Protected workspace access
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Access is controlled by your
                    organisation and JINLAB Nexus
                    security policies.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs leading-5 text-slate-400">
              JINLAB Nexus · Secure business
              operating system
            </p>
          </div>
        </div>
      </section>
            <div className="pb-6 text-center text-xs text-slate-400">
          <a
            href="/privacy"
            className="hover:text-slate-600"
          >
            Privacy
          </a>
          <span className="mx-2">·</span>
          <a
            href="/terms"
            className="hover:text-slate-600"
          >
            Terms
          </a>
        </div>
</main>
  );
}
