"use client";

import { useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

type CompanyFormData = {
  company_name: string;
  email: string;
  phone: string;
  registration_number: string;
};

type CompanyFormProps = {
  onSave: (company: CompanyFormData) => Promise<void>;
  onCancel: () => void;
};

export default function CompanyForm({
  onSave,
  onCancel,
}: CompanyFormProps) {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [registrationNumber, setRegistrationNumber] =
    useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!companyName.trim()) {
      setMessage("Company name is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await onSave({
        company_name: companyName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        registration_number: registrationNumber.trim(),
      });

      setCompanyName("");
      setEmail("");
      setPhone("");
      setRegistrationNumber("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save company."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppCard>
      <form
        onSubmit={handleSubmit}
        className="grid gap-4"
      >
        <h2 className="text-xl font-semibold">
          Add Company
        </h2>

        <AppInput
          label="Company Name"
          value={companyName}
          placeholder="Enter company name"
          required
          onChange={setCompanyName}
        />

        <AppInput
          label="Email"
          value={email}
          placeholder="Enter company email"
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

        <AppInput
          label="Registration Number"
          value={registrationNumber}
          placeholder="Enter registration number"
          onChange={setRegistrationNumber}
        />

        {message && (
          <p className="text-sm text-destructive">
            {message}
          </p>
        )}

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Company"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AppCard>
  );
}
