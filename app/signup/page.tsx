"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
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

export default function SignupPage() {
  const router =
    useRouter();

  const [fullName, setFullName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
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

  const [sent, setSent] =
    useState(false);

  async function signup(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanEmail =
      email.trim().toLowerCase();

    const cleanName =
      fullName.trim();

    setMessage("");

    if (!cleanName) {
      setMessage(
        "Enter your full name."
      );
      return;
    }

    if (password.length < 8) {
      setMessage(
        "Use a password with at least 8 characters."
      );
      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setMessage(
        "The passwords do not match."
      );
      return;
    }

    setBusy(true);

    try {
      const {
        data,
        error,
      } =
        await supabase.auth.signUp(
          {
            email:
              cleanEmail,
            password,
            options: {
              emailRedirectTo:
                `${window.location.origin}/auth/complete`,
              data: {
                full_name:
                  cleanName,
              },
            },
          }
        );

      if (error) {
        setMessage(
          error.message
        );
        return;
      }

      if (data.session) {
        router.replace(
          "/auth/complete"
        );
        return;
      }

      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  async function socialSignup(
    provider: SocialProvider
  ) {
    setSocialBusy(provider);
    setMessage("");

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

      setMessage(
        error instanceof Error
          ? `${providerName} authentication failed: ${error.message}`
          : `${providerName} authentication failed.`
      );

      setSocialBusy(null);
    }
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight">
            Check your email
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            We sent an account confirmation
            link to{" "}
            <strong>
              {email}
            </strong>
            .
          </p>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            After verification, Nexus will
            check whether your account belongs
            to an organisation workspace.
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/login"
              )
            }
            className="mt-7 h-11 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white"
          >
            Return to sign in
          </button>
        </div>
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

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden min-h-screen bg-slate-950 p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lg font-black text-slate-950">
            J
          </div>

          <div>
            <p className="font-extrabold tracking-[0.12em]">
              JINLAB
            </p>

            <p className="text-xs uppercase tracking-[0.26em] text-blue-400">
              Nexus
            </p>
          </div>
        </div>

        <div className="max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300">
            <ShieldCheck className="h-4 w-4" />
            Secure account creation
          </div>

          <h1 className="mt-6 text-5xl font-semibold leading-tight tracking-[-0.04em]">
            Your business workspace starts here.
          </h1>

          <p className="mt-5 text-base leading-8 text-slate-300">
            Create your Nexus identity securely.
            Workspace access remains controlled
            by organisation membership and
            permissions.
          </p>
        </div>

        <p className="text-xs text-slate-500">
          JINLAB Nexus · Business Operating System
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[470px]">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/login"
              )
            }
            className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </button>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-3xl font-bold tracking-[-0.035em]">
              Create your account
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Join JINLAB Nexus using your
              organisation identity.
            </p>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                disabled={
                  socialBusy !== null ||
                  busy
                }
                onClick={() =>
                  void socialSignup(
                    "google"
                  )
                }
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {socialBusy ===
                "google" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}

                Sign up with Google
              </button>

              <button
                type="button"
                disabled={
                  socialBusy !== null ||
                  busy
                }
                onClick={() =>
                  void socialSignup(
                    "apple"
                  )
                }
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-black text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
              >
                {socialBusy ===
                "apple" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <AppleIcon />
                )}

                Sign up with Apple
              </button>
            </div>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />

              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                or
              </span>

              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form
              onSubmit={signup}
              className="space-y-4"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Full name
                </span>

                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={
                      fullName
                    }
                    onChange={(
                      event
                    ) =>
                      setFullName(
                        event.target
                          .value
                      )
                    }
                    className="h-12 w-full rounded-xl border border-slate-300 pl-11 pr-3 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Your full name"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Email address
                </span>

                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                  <input
                    type="email"
                    required
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
                    className="h-12 w-full rounded-xl border border-slate-300 pl-11 pr-3 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="name@company.com"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Password
                </span>

                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    required
                    minLength={8}
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
                    className="h-12 w-full rounded-xl border border-slate-300 pl-11 pr-12 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Minimum 8 characters"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (value) =>
                          !value
                      )
                    }
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
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
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Confirm password
                </span>

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  required
                  minLength={8}
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
                  className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Repeat your password"
                />
              </label>

              {message && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
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
                className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {busy && (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                )}

                Create Nexus account
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-5 text-slate-400">
              Creating an identity does not
              automatically grant access to a
              company workspace.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
