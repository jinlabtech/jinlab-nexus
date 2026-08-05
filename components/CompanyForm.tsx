"use client";

import { useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";
import type { CompanyFormData } from "@/lib/services/companyService";

type CompanyFormProps = {
  onSave: (company: CompanyFormData) => Promise<void>;
  onCancel: () => void;
};

export default function CompanyForm({
  onSave,
  onCancel,
}: CompanyFormProps) {
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] =
    useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!companyName.trim()) {
      setErrorMessage("Company name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        company_name: companyName.trim(),
        registration_number: registrationNumber.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The company could not be saved."
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
            Add company
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Register a new organisation in JINLAB Nexus.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Company Name"
            value={companyName}
            placeholder="Enter company name"
            required
            onChange={setCompanyName}
          />

          <AppInput
            label="Registration Number"
            value={registrationNumber}
            placeholder="Enter registration number"
            onChange={setRegistrationNumber}
          />

          <AppInput
            label="Email"
            value={email}
            placeholder="company@example.com"
            type="email"
            onChange={setEmail}
          />

          <AppInput
            label="Phone"
            value={phone}
            placeholder="Enter phone number"
            type="tel"
            onChange={setPhone}
          />
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Company"}
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
