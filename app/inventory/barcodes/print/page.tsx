"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import JsBarcode from "jsbarcode";

import {
  Printer,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type LabelItem = {
  id: string;
  item_name: string;
  sku: string;
  barcode: string;
  selling_price: number;
  copies: number;
};


type PrintableLabel = {
  id: string;
  item_name: string;
  sku: string;
  barcode: string;
  selling_price: number;
};


type LabelTemplate =
  "45up" |
  "6up";


type TemplateDefinition = {
  id: LabelTemplate;
  name: string;
  description: string;
  slots: number;
  columns: number;
  rows: number;
};


const templates:
  TemplateDefinition[] =
[
  {
    id: "45up",
    name: "A4 45-up",
    description:
      "3 columns × 15 rows · Small product labels",
    slots: 45,
    columns: 3,
    rows: 15,
  },

  {
    id: "6up",
    name: "A4 6-up",
    description:
      "2 columns × 3 rows · Large stock / asset labels",
    slots: 6,
    columns: 2,
    rows: 3,
  },
];


function money(
  value: number
) {

  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value || 0
    )
  );
}


function BarcodeSvg({
  value,
  large = false,
}: {
  value: string;
  large?: boolean;
}) {

  const ref =
    useRef<SVGSVGElement | null>(
      null
    );


  useEffect(
    () => {

      if (!ref.current) {
        return;
      }


      JsBarcode(
        ref.current,
        value,
        {
          format:
            "CODE128",

          displayValue:
            false,

          margin:
            0,

          height:
            large
              ? 60
              : 28,

          width:
            large
              ? 1.7
              : 1.15,
        }
      );

    },
    [
      value,
      large,
    ]
  );


  return (
    <svg
      ref={ref}
      className={
        large
          ? "barcode-svg barcode-svg-large"
          : "barcode-svg"
      }
      aria-label={
        `Barcode ${value}`
      }
    />
  );
}


export default function BarcodePrintPage() {

  const [
    labels,
    setLabels,
  ] =
    useState<PrintableLabel[]>(
      []
    );


  const [
    template,
    setTemplate,
  ] =
    useState<LabelTemplate>(
      "45up"
    );


  const [
    startPosition,
    setStartPosition,
  ] =
    useState(
      1
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState(
      ""
    );


  const definition =
    templates.find(
      (
        item
      ) =>
        item.id ===
        template
    ) ??
    templates[0];


  useEffect(
    () => {

      async function load() {

        try {

          const params =
            new URLSearchParams(
              window.location.search
            );


          const encoded =
            params.get(
              "items"
            );


          const requestedTemplate =
            params.get(
              "template"
            );


          if (
            requestedTemplate ===
            "6up"
          ) {

            setTemplate(
              "6up"
            );

          }


          if (!encoded) {

            setErrorMessage(
              "No label items were selected."
            );

            return;
          }


          const payload =
            JSON.parse(
              encoded
            );


          const {
            data,
            error,
          } =
            await supabase.rpc(
              "get_inventory_barcode_labels",
              {
                p_items:
                  payload,
              }
            );


          if (error) {
            throw error;
          }


          const rows =
            (
              data ??
              []
            ) as LabelItem[];


          const expanded:
            PrintableLabel[] =
            [];


          rows.forEach(
            (
              row
            ) => {

              const copies =
                Math.max(
                  1,
                  Number(
                    row.copies
                  )
                );


              for (
                let index = 0;
                index < copies;
                index += 1
              ) {

                expanded.push(
                  {
                    id:
                      `${row.id}-${index}`,

                    item_name:
                      row.item_name,

                    sku:
                      row.sku,

                    barcode:
                      row.barcode,

                    selling_price:
                      Number(
                        row.selling_price
                      ),
                  }
                );

              }

            }
          );


          setLabels(
            expanded
          );

        } catch (
          error
        ) {

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to prepare barcode labels."
          );

        } finally {

          setLoading(
            false
          );

        }

      }


      void load();

    },
    []
  );


  useEffect(
    () => {

      setStartPosition(
        1
      );

    },
    [
      template,
    ]
  );


  const sheetSlots =
    useMemo(
      () => {

        const offset =
          startPosition -
          1;


        const slots:
          (
            PrintableLabel |
            null
          )[] =
          [];


        for (
          let index = 0;
          index < offset;
          index += 1
        ) {

          slots.push(
            null
          );

        }


        labels.forEach(
          (
            label
          ) => {

            slots.push(
              label
            );

          }
        );


        return slots;

      },
      [
        labels,
        startPosition,
      ]
    );


  const pages =
    useMemo(
      () => {

        const nextPages:
          (
            PrintableLabel |
            null
          )[][] =
          [];


        for (
          let index = 0;
          index < sheetSlots.length;
          index += definition.slots
        ) {

          nextPages.push(
            sheetSlots.slice(
              index,
              index +
              definition.slots
            )
          );

        }


        if (
          nextPages.length ===
          0
        ) {

          nextPages.push(
            []
          );

        }


        return nextPages;

      },
      [
        sheetSlots,
        definition.slots,
      ]
    );


  const totalSheets =
    Math.max(
      1,
      Math.ceil(
        (
          labels.length +
          startPosition -
          1
        )
        /
        definition.slots
      )
    );


  return (
    <main className="barcode-print-root">

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        body {
          margin: 0;
        }

        .barcode-sheet {
          box-sizing: border-box;
          width: 210mm;
          height: 297mm;
          background: white;
          color: black;
          page-break-after: always;
          overflow: hidden;
        }

        .barcode-sheet:last-child {
          page-break-after: auto;
        }

        .barcode-sheet-45up {
          padding: 7.5mm;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(15, 1fr);
        }

        .barcode-sheet-6up {
          padding: 10mm;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-template-rows: repeat(3, 1fr);
          column-gap: 5mm;
          row-gap: 5mm;
        }

        .barcode-label {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
          border: 0.2mm dashed #d4d4d4;
        }

        .barcode-label-45up {
          padding: 1mm 1.6mm;
        }

        .barcode-label-6up {
          padding: 6mm;
          align-items: center;
          text-align: center;
        }

        .barcode-label-empty {
          min-width: 0;
          min-height: 0;
          box-sizing: border-box;
          border: 0.2mm dashed #e5e5e5;
          background: #fafafa;
        }

        .barcode-label-name-45up {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          font-size: 7.5pt;
          font-weight: 700;
          line-height: 1.1;
        }

        .barcode-label-name-6up {
          width: 100%;
          font-size: 16pt;
          font-weight: 800;
          line-height: 1.15;
        }

        .barcode-label-meta-45up {
          margin-top: 0.4mm;
          font-size: 6.3pt;
          line-height: 1.1;
        }

        .barcode-label-meta-6up {
          margin-top: 3mm;
          font-size: 11pt;
          line-height: 1.3;
        }

        .barcode-svg {
          display: block;
          width: 100%;
          max-height: 8mm;
          margin-top: 0.6mm;
        }

        .barcode-svg-large {
          max-height: 22mm;
          margin-top: 6mm;
        }

        .barcode-value {
          margin-top: 0.2mm;
          font-family: monospace;
          font-size: 5.8pt;
          text-align: center;
          letter-spacing: 0.1mm;
        }

        .barcode-value-large {
          margin-top: 2mm;
          font-size: 10pt;
          font-weight: 700;
        }

        .barcode-brand-large {
          width: 100%;
          margin-bottom: 4mm;
          font-size: 9pt;
          font-weight: 800;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .barcode-price-large {
          margin-top: 4mm;
          font-size: 15pt;
          font-weight: 800;
        }

        @media print {

          .barcode-print-controls {
            display: none !important;
          }

          .barcode-label {
            border: none;
          }

          .barcode-label-empty {
            border: none;
            background: white;
          }

        }
      `}</style>


      <div className="barcode-print-controls border-b bg-background p-4">

        <div className="mx-auto max-w-6xl">

          <div className="flex flex-wrap items-start justify-between gap-4">

            <div>

              <h1 className="text-lg font-bold">
                Barcode Label Print Studio
              </h1>


              <p className="mt-1 text-sm text-muted-foreground">
                Preview placement before printing.
              </p>

            </div>


            <Button
              type="button"
              onClick={() =>
                window.print()
              }
              disabled={
                labels.length ===
                0
              }
            >
              <Printer className="mr-2 h-4 w-4" />

              Print Labels
            </Button>

          </div>


          <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">


            <div className="space-y-4">


              <div className="rounded-2xl border p-4">

                <label className="text-sm font-semibold">
                  Label template
                </label>


                <select
                  value={
                    template
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setTemplate(
                        event.target.value as LabelTemplate
                      )
                  }
                  className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-base"
                >

                  {
                    templates.map(
                      (
                        item
                      ) => (

                        <option
                          key={
                            item.id
                          }
                          value={
                            item.id
                          }
                        >
                          {
                            item.name
                          }
                        </option>

                      )
                    )
                  }

                </select>


                <p className="mt-2 text-xs text-muted-foreground">
                  {
                    definition.description
                  }
                </p>

              </div>


              <div className="rounded-2xl border p-4">

                <p className="font-semibold">
                  Starting sticker
                </p>


                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the first unused position on
                  your physical sticker sheet.
                </p>


                <input
                  type="number"
                  min={1}
                  max={
                    definition.slots
                  }
                  value={
                    startPosition
                  }
                  onChange={
                    (
                      event
                    ) => {

                      const next =
                        Math.max(
                          1,
                          Math.min(
                            definition.slots,
                            Number(
                              event.target.value
                            ) ||
                            1
                          )
                        );


                      setStartPosition(
                        next
                      );
                    }
                  }
                  className="mt-4 h-11 w-full rounded-xl border bg-background px-3 text-base"
                />


                <div className="mt-4 rounded-xl bg-muted/40 p-3">

                  <p className="text-xs text-muted-foreground">
                    Printing begins at
                  </p>


                  <p className="mt-1 text-xl font-bold">
                    Sticker {
                      startPosition
                    }
                  </p>

                </div>

              </div>


              <div className="rounded-2xl border p-4 text-sm">

                <div className="flex justify-between gap-3">

                  <span className="text-muted-foreground">
                    Labels
                  </span>

                  <span className="font-bold">
                    {
                      labels.length
                    }
                  </span>

                </div>


                <div className="mt-2 flex justify-between gap-3">

                  <span className="text-muted-foreground">
                    Sheet capacity
                  </span>

                  <span className="font-bold">
                    {
                      definition.slots
                    }
                  </span>

                </div>


                <div className="mt-2 flex justify-between gap-3">

                  <span className="text-muted-foreground">
                    Sheets required
                  </span>

                  <span className="font-bold">
                    {
                      totalSheets
                    }
                  </span>

                </div>

              </div>

            </div>


            <div className="rounded-2xl border p-4">

              <p className="font-semibold">
                Sheet position preview
              </p>


              <p className="mt-1 text-xs text-muted-foreground">
                Tap the first unused sticker position.
              </p>


              <div
                className={
                  template ===
                  "6up"
                    ? "mt-4 grid grid-cols-2 gap-2"
                    : "mt-4 grid grid-cols-3 gap-1"
                }
              >

                {
                  Array.from(
                    {
                      length:
                        definition.slots,
                    },
                    (
                      _,
                      index
                    ) => {

                      const position =
                        index +
                        1;


                      const before =
                        position <
                        startPosition;


                      const selected =
                        position ===
                        startPosition;


                      return (

                        <button
                          key={
                            position
                          }
                          type="button"
                          onClick={() =>
                            setStartPosition(
                              position
                            )
                          }
                          className={
                            `${
                              template ===
                              "6up"
                                ? "min-h-24"
                                : "min-h-11"
                            } rounded-md border px-2 py-2 text-xs font-semibold transition ${
                              selected
                                ? "border-foreground bg-foreground text-background"
                                : before
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-background"
                            }`
                          }
                        >
                          {
                            position
                          }
                        </button>

                      );

                    }
                  )
                }

              </div>


              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">

                <span>
                  Grey = used
                </span>

                <span>
                  Dark = start
                </span>

                <span>
                  White = available
                </span>

              </div>

            </div>

          </div>


          <div className="mt-5 rounded-xl border p-4 text-xs text-muted-foreground">

            Before using a new sticker supplier,
            print one test page on ordinary A4 paper.
            Place it behind the sticker sheet and
            compare alignment.

            We can later save calibrated templates
            for each physical sticker brand.

          </div>

        </div>

      </div>


      {
        loading && (
          <div className="p-10 text-center">
            Preparing labels...
          </div>
        )
      }


      {
        errorMessage && (
          <div className="p-10 text-center text-destructive">
            {
              errorMessage
            }
          </div>
        )
      }


      {
        !loading &&
        !errorMessage &&
        pages.map(
          (
            page,
            pageIndex
          ) => {

            const padded =
              [
                ...page,
              ];


            while (
              padded.length <
              definition.slots
            ) {

              padded.push(
                null
              );

            }


            return (

              <section
                key={
                  `${template}-${pageIndex}`
                }
                className={
                  template ===
                  "6up"
                    ? "barcode-sheet barcode-sheet-6up"
                    : "barcode-sheet barcode-sheet-45up"
                }
              >

                {
                  padded.map(
                    (
                      label,
                      slotIndex
                    ) => {

                      if (!label) {

                        return (
                          <div
                            key={
                              `empty-${pageIndex}-${slotIndex}`
                            }
                            className="barcode-label-empty"
                          />
                        );

                      }


                      const large =
                        template ===
                        "6up";


                      return (

                        <div
                          key={
                            label.id
                          }
                          className={
                            large
                              ? "barcode-label barcode-label-6up"
                              : "barcode-label barcode-label-45up"
                          }
                        >

                          {
                            large && (
                              <div className="barcode-brand-large">
                                JINLAB NEXUS
                              </div>
                            )
                          }


                          <div
                            className={
                              large
                                ? "barcode-label-name-6up"
                                : "barcode-label-name-45up"
                            }
                          >
                            {
                              label.item_name
                            }
                          </div>


                          <div
                            className={
                              large
                                ? "barcode-label-meta-6up"
                                : "barcode-label-meta-45up"
                            }
                          >
                            SKU: {
                              label.sku
                            }

                            {
                              !large && (
                                <>
                                  {" · "}
                                  {
                                    money(
                                      label.selling_price
                                    )
                                  }
                                </>
                              )
                            }
                          </div>


                          <BarcodeSvg
                            value={
                              label.barcode
                            }
                            large={
                              large
                            }
                          />


                          <div
                            className={
                              large
                                ? "barcode-value barcode-value-large"
                                : "barcode-value"
                            }
                          >
                            {
                              label.barcode
                            }
                          </div>


                          {
                            large && (
                              <div className="barcode-price-large">
                                {
                                  money(
                                    label.selling_price
                                  )
                                }
                              </div>
                            )
                          }

                        </div>

                      );

                    }
                  )
                }

              </section>

            );

          }
        )
      }

    </main>
  );
}
