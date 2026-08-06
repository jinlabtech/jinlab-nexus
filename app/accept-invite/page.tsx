"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export default function AcceptInvitePage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(
    "Checking your invitation..."
  );

  useEffect(() => {
    async function prepareInvitation() {
      const hashParameters = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );

      const accessToken =
        hashParameters.get("access_token");
      const refreshToken =
        hashParameters.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } =
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

        if (sessionError) {
          setMessage(sessionError.message);
          return;
        }

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!session) {
        setMessage(
          "This invitation link is invalid, expired, or has already been used."
        );
        return;
      }

      setMessage("");
      setReady(true);
    }

    prepareInvitation();
  }, []);

  async function setAccountPassword(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (password.length < 8) {
      setMessage(
        "Your password must contain at least 8 characters."
      );
      return;
    }

    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <section className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-primary">
          JINLAB Nexus
        </p>

        <h1 className="mt-2 text-2xl font-bold">
          Accept invitation
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Create a secure password to activate your account.
        </p>

        {message && (
          <div className="mt-5 rounded-lg border p-3 text-sm">
            {message}
          </div>
        )}

        {ready && (
          <form
            onSubmit={setAccountPassword}
            className="mt-6 grid gap-4"
          >
            <AppInput
              label="New Password"
              value={password}
              placeholder="At least 8 characters"
              type="password"
              required
              onChange={setPassword}
            />

            <AppInput
              label="Confirm Password"
              value={confirmation}
              placeholder="Repeat your password"
              type="password"
              required
              onChange={setConfirmation}
            />

            <Button
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Activating..."
                : "Activate Account"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
