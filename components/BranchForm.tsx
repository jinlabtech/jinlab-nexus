"use client";

import {
  useEffect,
  useState,
} from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  Branch,
  BranchFormData,
} from "@/types/branch";

type BranchFormProps = {
  branch?: Branch | null;
  onSave: (branch: BranchFormData) => Promise<void>;
  onCancel: () => void;
};

export default function BranchForm({
  branch,
  onSave,
  onCancel,
}: BranchFormProps) {
  const [branchName, setBranchName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isEditing = Boolean(branch);

  useEffect(() => {
    setBranchName(branch?.branch_name ?? "");
    setAddress(branch?.address ?? "");
    setErrorMessage("");
  }, [branch]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!branchName.trim()) {
      setErrorMessage("Branch name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        branch_name: branchName.trim(),
        address: address.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The branch could not be saved."
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
            {isEditing ? "Edit branch" : "Add branch"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? "Update this branch's information."
              : "Create a new business location."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Branch Name"
            value={branchName}
            placeholder="Example: Vryheid Branch"
            required
            onChange={setBranchName}
          />

          <AppInput
            label="Address"
            value={address}
            placeholder="Enter the branch address"
            onChange={setAddress}
          />
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
            {saving
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Save Branch"}
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
