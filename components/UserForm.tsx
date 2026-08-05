"use client";

import { useEffect, useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  UpdateUserProfileData,
  UserProfile,
  UserRole,
} from "@/types/userProfile";

type UserFormProps = {
  user: UserProfile;
  onSave: (
    profile: UpdateUserProfileData
  ) => Promise<void>;
  onCancel: () => void;
};

const availableRoles: UserRole[] = [
  "owner",
  "admin",
  "manager",
  "technician",
  "cashier",
  "employee",
  "viewer",
];

export default function UserForm({
  user,
  onSave,
  onCancel,
}: UserFormProps) {
  const [fullName, setFullName] = useState("");
  const [role, setRole] =
    useState<UserRole>("employee");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setFullName(user.full_name);
    setRole(user.role);
    setErrorMessage("");
  }, [user]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!fullName.trim()) {
      setErrorMessage("Full name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        full_name: fullName.trim(),
        role,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The user profile could not be updated."
      );
    } finally {
      setSaving(false);
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
            Edit user
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Update the user&apos;s name and access role.
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

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Role
            </span>

            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as UserRole)
              }
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
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

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email address
          </p>

          <p className="mt-1 text-sm">
            {user.email || "-"}
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AppCard>
  );
}
