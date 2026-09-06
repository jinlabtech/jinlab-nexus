"use client";

import {
  useEffect,
  useState,
} from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  Customer,
  CustomerFormData,
  CustomerType,
} from "@/types/customer";

type CustomerFormProps = {
  customer?: Customer | null;

  onSave: (
    data: CustomerFormData
  ) => Promise<void>;

  onCancel: () => void;
};

export default function CustomerForm({
  customer,
  onSave,
  onCancel,
}: CustomerFormProps) {
  const [customerType, setCustomerType] =
    useState<CustomerType>(
      "individual"
    );

  const [customerName, setCustomerName] =
    useState("");

  const [contactPerson, setContactPerson] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [
    alternativePhone,
    setAlternativePhone,
  ] = useState("");

  const [
    registrationNumber,
    setRegistrationNumber,
  ] = useState("");

  const [vatNumber, setVatNumber] =
    useState("");

  const [
    addressLine1,
    setAddressLine1,
  ] = useState("");

  const [
    addressLine2,
    setAddressLine2,
  ] = useState("");

  const [city, setCity] =
    useState("");

  const [province, setProvince] =
    useState("KwaZulu-Natal");

  const [
    postalCode,
    setPostalCode,
  ] = useState("");

  const [country, setCountry] =
    useState("South Africa");

  const [
    creditLimit,
    setCreditLimit,
  ] = useState("0");

  const [
    paymentTermsDays,
    setPaymentTermsDays,
  ] = useState("0");

  const [notes, setNotes] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const isEditing =
    Boolean(customer);

  useEffect(() => {
    setCustomerType(
      customer?.customer_type ??
        "individual"
    );

    setCustomerName(
      customer?.customer_name ??
        ""
    );

    setContactPerson(
      customer?.contact_person ??
        ""
    );

    setEmail(
      customer?.email ?? ""
    );

    setPhone(
      customer?.phone ?? ""
    );

    setAlternativePhone(
      customer?.alternative_phone ??
        ""
    );

    setRegistrationNumber(
      customer?.registration_number ??
        ""
    );

    setVatNumber(
      customer?.vat_number ??
        ""
    );

    setAddressLine1(
      customer?.address_line_1 ??
        ""
    );

    setAddressLine2(
      customer?.address_line_2 ??
        ""
    );

    setCity(
      customer?.city ?? ""
    );

    setProvince(
      customer?.province ??
        "KwaZulu-Natal"
    );

    setPostalCode(
      customer?.postal_code ??
        ""
    );

    setCountry(
      customer?.country ??
        "South Africa"
    );

    setCreditLimit(
      customer
        ? String(
            customer.credit_limit
          )
        : "0"
    );

    setPaymentTermsDays(
      customer
        ? String(
            customer.payment_terms_days
          )
        : "0"
    );

    setNotes(
      customer?.notes ?? ""
    );

    setErrorMessage("");
  }, [customer]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!customerName.trim()) {
      setErrorMessage(
        "Customer name is required."
      );
      return;
    }

    const parsedCredit =
      Number(creditLimit);

    const parsedTerms =
      Number(paymentTermsDays);

    if (
      Number.isNaN(parsedCredit) ||
      parsedCredit < 0
    ) {
      setErrorMessage(
        "Credit limit must be 0 or greater."
      );
      return;
    }

    if (
      !Number.isInteger(
        parsedTerms
      ) ||
      parsedTerms < 0
    ) {
      setErrorMessage(
        "Payment terms must be a whole number."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        customer_type:
          customerType,
        customer_name:
          customerName.trim(),
        contact_person:
          contactPerson.trim(),
        email:
          email.trim(),
        phone:
          phone.trim(),
        alternative_phone:
          alternativePhone.trim(),
        registration_number:
          registrationNumber.trim(),
        vat_number:
          vatNumber.trim(),
        address_line_1:
          addressLine1.trim(),
        address_line_2:
          addressLine2.trim(),
        city:
          city.trim(),
        province:
          province.trim(),
        postal_code:
          postalCode.trim(),
        country:
          country.trim(),
        credit_limit:
          parsedCredit,
        payment_terms_days:
          parsedTerms,
        notes:
          notes.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Customer could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppCard>
      <form
        onSubmit={handleSubmit}
        className="grid gap-6"
      >
        <div>
          <h2 className="text-xl font-semibold">
            {isEditing
              ? "Edit Customer"
              : "Add Customer"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Maintain customer,
            organisation and account
            information.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Customer Type
            </span>

            <select
              value={customerType}
              onChange={(event) =>
                setCustomerType(
                  event.target.value as CustomerType
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="individual">
                Individual
              </option>

              <option value="business">
                Business
              </option>

              <option value="school">
                School
              </option>

              <option value="government">
                Government
              </option>

              <option value="organisation">
                Organisation
              </option>
            </select>
          </label>

          <AppInput
            label="Customer / Organisation Name"
            value={customerName}
            required
            onChange={setCustomerName}
          />

          <AppInput
            label="Contact Person"
            value={contactPerson}
            onChange={setContactPerson}
          />

          <AppInput
            label="Email"
            value={email}
            type="email"
            onChange={setEmail}
          />

          <AppInput
            label="Phone"
            value={phone}
            type="tel"
            onChange={setPhone}
          />

          <AppInput
            label="Alternative Phone"
            value={alternativePhone}
            type="tel"
            onChange={
              setAlternativePhone
            }
          />

          <AppInput
            label="Registration Number"
            value={registrationNumber}
            onChange={
              setRegistrationNumber
            }
          />

          <AppInput
            label="VAT Number"
            value={vatNumber}
            onChange={setVatNumber}
          />

          <AppInput
            label="Address Line 1"
            value={addressLine1}
            onChange={setAddressLine1}
          />

          <AppInput
            label="Address Line 2"
            value={addressLine2}
            onChange={setAddressLine2}
          />

          <AppInput
            label="City"
            value={city}
            onChange={setCity}
          />

          <AppInput
            label="Province"
            value={province}
            onChange={setProvince}
          />

          <AppInput
            label="Postal Code"
            value={postalCode}
            onChange={setPostalCode}
          />

          <AppInput
            label="Country"
            value={country}
            onChange={setCountry}
          />

        </div>

        <div className="rounded-xl border bg-muted/20 p-5">
          <div>
            <p className="text-sm font-medium text-primary">
              Account Control
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              Account & Credit
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Set how much credit this customer may use
              and when invoices are expected to be paid.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <AppInput
              label="Credit Limit (R)"
              value={creditLimit}
              type="number"
              min={0}
              step="0.01"
              onChange={setCreditLimit}
            />

            <AppInput
              label="Payment Terms (Days)"
              value={paymentTermsDays}
              type="number"
              min={0}
              step="1"
              onChange={
                setPaymentTermsDays
              }
            />
          </div>

          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            A credit limit of R0 means no limit has been
            configured yet. Payment terms of 0 days mean
            payment is due immediately.
          </p>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Notes
          </span>

          <textarea
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value
              )
            }
            rows={4}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
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
                : "Save Customer"}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AppCard>
  );
}
