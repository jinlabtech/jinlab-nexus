"use client";

import { useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  InviteUserData,
  UserRole,
} from "@/types/userProfile";

type InvitableRole = Exclude<UserRole, "owner">;

type UserInviteFormProps = {
  onInvite: (data: InviteUserData) => Promise<void>;
  onCancel: () => void;
};

const availableRoles: InvitableRole[] = [
  "admin",
  "manager",
  "technician",
  "cashier",
  "employee",
  "viewer",
];

export default function UserInviteForm({
  onInvite,
  onCancel,
}: UserInviteFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] =
    useState<InvitableRole>("employee");

  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!fullName.trim()) {
      setErrorMessage("Full name is required.");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Email address is required.");
      return;
    }

    setSending(true);
    setErrorMessage("");

    try {
      await onInvite({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The invitation could not be sent."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <AppCard>
      <form
        onSubmit={handleSubmit}
        className="grid gap-5"
      >
        <div>
          <h2 className="text-xl font-semibold">
            Invite user
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Send a secure JINLAB Nexus invitation.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Full Name"
            value={fullName}
            placeholder="Enter full name"
            required
            onChange={setFullName}
          />

          <AppInput
            label="Email Address"
            value={email}
            placeholder="user@example.com"
            type="email"
            required
            onChange={setEmail}
          />

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Role
            </span>

            <select
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value as InvitableRole
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {availableRoles.map((roleOption) => (
                <option
                  key={roleOption}
                  value={roleOption}
                >
                  {roleOption.charAt(0).toUpperCase() +
                    roleOption.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={sending}
          >
            {sending
              ? "Sending..."
              : "Send Invitation"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={sending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AppCard>
  );
}
