"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import { Button } from "@/components/ui/button";

import type {
  InvoiceTemplate,
} from "@/components/invoice-templates/InvoiceTemplateRenderer";

type Props = {
  invoiceId: string;
};

type TemplateOption = {
  id: InvoiceTemplate;
  name: string;
  description: string;
  available: boolean;
};

const templates:
  TemplateOption[] = [
    {
      id:
        "jinlab-signature",
      name:
        "JINLAB Signature",
      description:
        "Premium branded business invoice.",
      available:
        true,
    },
    {
      id:
        "executive",
      name:
        "Executive",
      description:
        "Formal corporate layout.",
      available:
        false,
    },
    {
      id:
        "minimal",
      name:
        "Minimal",
      description:
        "Simple clean invoice.",
      available:
        false,
    },
    {
      id:
        "retail",
      name:
        "Retail / POS",
      description:
        "Compact layout for retail sales.",
      available:
        false,
    },
    {
      id:
        "corporate",
      name:
        "Corporate",
      description:
        "Detailed enterprise document.",
      available:
        false,
    },
  ];

export default function InvoiceTemplateSelector({
  invoiceId,
}: Props) {
  const router =
    useRouter();

  const [
    selected,
    setSelected,
  ] =
    useState<InvoiceTemplate>(
      "jinlab-signature"
    );

  function preview() {
    router.push(
      `/invoices/${invoiceId}/print?template=${selected}`
    );
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">
          Invoice Design
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Select how this invoice will appear when printed or saved as PDF.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">

        {templates.map(
          (template) => {
            const active =
              selected ===
              template.id;

            return (
              <button
                key={
                  template.id
                }
                type="button"
                disabled={
                  !template.available
                }
                onClick={() =>
                  setSelected(
                    template.id
                  )
                }
                className={[
                  "rounded-xl border p-4 text-left transition",
                  active
                    ? "border-black ring-1 ring-black"
                    : "hover:bg-muted/40",
                  !template.available
                    ? "cursor-not-allowed opacity-50"
                    : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    {
                      template.name
                    }
                  </p>

                  {!template.available && (
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase">
                      Coming Soon
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {
                    template.description
                  }
                </p>
              </button>
            );
          }
        )}

      </div>

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          onClick={preview}
        >
          Preview / Print Invoice
        </Button>
      </div>
    </section>
  );
}
