"use client";

import { useState } from "react";

type CompanyFormProps = {
  onSave: (company: {
    company_name: string;
    email: string;
    phone: string;
    registration_number: string;
  }) => Promise<void>;
};

export default function CompanyForm({
  onSave,
}: CompanyFormProps) {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    await onSave({
      company_name: companyName,
      email,
      phone,
      registration_number: registrationNumber,
    });

    setCompanyName("");
    setEmail("");
    setPhone("");
    setRegistrationNumber("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginBottom: "30px",
        display: "grid",
        gap: "12px",
        maxWidth: "500px",
      }}
    >
      <input
        placeholder="Company Name"
        value={companyName}
        onChange={(e) =>
          setCompanyName(e.target.value)
        }
      />

      <input
        placeholder="Email"
        value={email}
        onChange={(e) =>
          setEmail(e.target.value)
        }
      />

      <input
        placeholder="Phone"
        value={phone}
        onChange={(e) =>
          setPhone(e.target.value)
        }
      />

      <input
        placeholder="Registration Number"
        value={registrationNumber}
        onChange={(e) =>
          setRegistrationNumber(e.target.value)
        }
      />

      <button type="submit">
        Save Company
      </button>
    </form>
  );
}
