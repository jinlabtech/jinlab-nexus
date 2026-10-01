"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  ArrowLeft,
  FileText,
  Printer,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type ReceiptTender = {
  id?: string;
  payment_method: string;
  amount: number;
  amount_tendered: number;
  change_due: number;
  reference?: string | null;
};


type ReceiptItem = {
  id: string;
  description: string;
  quantity: number;
  catalogue_unit_price: number;
  automatic_unit_price?: number | null;
  unit_price: number;
  discount_mode: string;
  discount_value: number;
  line_total: number;
  price_source?: string | null;
  price_book_name?: string | null;
  promotion_name?: string | null;
  tax_rate?: number | null;
  line_tax?: number | null;
};


type ReceiptData = {
  ok: boolean;

  receipt_options: {
    paper_size?: string;
    auto_print?: boolean;
    show_cashier?: boolean;
    show_branch?: boolean;
  };

  company: {
    id: string;
    name: string;
    trading_name?: string | null;
    registration_number?: string | null;
    vat_registered?: boolean;
    vat_number?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
    footer?: string | null;
  };

  branch?: {
    id: string;
    name: string;
    address?: string | null;
  } | null;

  customer?: {
    id: string;
    name: string;
    number: string;
    phone?: string | null;
    vat_number?: string | null;
  } | null;

  cashier?: {
    user_id: string;
    name: string;
    email?: string | null;
  } | null;

  sale: {
    id: string;
    sale_number: string;
    invoice_id: string;
    payment_method: string;
    amount_tendered: number;
    total: number;
    change_due: number;
    reference?: string | null;
    status: string;
    created_at: string;
  };

  invoice: {
    id: string;
    number: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    amount_paid: number;
    balance_due: number;
  };

  items: ReceiptItem[];
  tenders: ReceiptTender[];

  automatic_savings: number;
  manual_discount: number;
  total_savings: number;

  print_count: number;
};


type PrintResult = {
  ok: boolean;
  print_type: "initial" | "reprint";
  print_count: number;
  event_id: string;
};


function money(
  value:
    number |
    string |
    null |
    undefined
) {

  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}


function quantity(
  value:
    number |
    string
) {

  const parsed =
    Number(
      value
    );

  return Number.isInteger(
    parsed
  )
    ? String(
        parsed
      )
    : parsed.toFixed(
        2
      );
}


export default function PosReceiptPage() {

  const params =
    useParams<{
      id: string;
    }>();

  const router =
    useRouter();

  const searchParams =
    useSearchParams();


  const saleId =
    params.id;


  const [
    receipt,
    setReceipt,
  ] =
    useState<ReceiptData | null>(
      null
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    printing,
    setPrinting,
  ] =
    useState(
      false
    );


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState(
      ""
    );


  const [
    reprintMarker,
    setReprintMarker,
  ] =
    useState(
      false
    );


  const autoPrintStarted =
    useRef(
      false
    );


  const paperSize =
    useMemo(
      () =>
        receipt
          ?.receipt_options
          ?.paper_size ===
        "58mm"
          ? "58mm"
          : "80mm",
      [
        receipt,
      ]
    );


  const loadReceipt =
    useCallback(
      async () => {

        setLoading(
          true
        );

        setErrorMessage(
          ""
        );


        const {
          data,
          error,
        } =
          await supabase.rpc(
            "get_pos_receipt",
            {
              p_pos_sale_id:
                saleId,
            }
          );


        if (error) {

          setErrorMessage(
            error.message
          );

          setLoading(
            false
          );

          return;
        }


        setReceipt(
          data as ReceiptData
        );

        setLoading(
          false
        );
      },
      [
        saleId,
      ]
    );


  const printReceipt =
    useCallback(
      async () => {

        if (
          !saleId ||
          printing
        ) {
          return;
        }


        setPrinting(
          true
        );

        setErrorMessage(
          ""
        );


        const {
          data,
          error,
        } =
          await supabase.rpc(
            "record_pos_receipt_print",
            {
              p_pos_sale_id:
                saleId,
            }
          );


        if (error) {

          setErrorMessage(
            error.message
          );

          setPrinting(
            false
          );

          return;
        }


        const result =
          data as PrintResult;


        setReprintMarker(
          result.print_type ===
            "reprint"
        );


        setReceipt(
          (
            current
          ) =>
            current
              ? {
                  ...current,
                  print_count:
                    result.print_count,
                }
              : current
        );


        await new Promise(
          (
            resolve
          ) =>
            window.setTimeout(
              resolve,
              120
            )
        );


        window.print();


        setPrinting(
          false
        );
      },
      [
        printing,
        saleId,
      ]
    );


  useEffect(
    () => {

      void loadReceipt();

    },
    [
      loadReceipt,
    ]
  );


  useEffect(
    () => {

      if (
        !receipt ||
        autoPrintStarted.current ||
        searchParams.get(
          "autoprint"
        ) !==
          "1" ||
        receipt
          .receipt_options
          .auto_print !==
          true
      ) {
        return;
      }


      autoPrintStarted.current =
        true;


      void printReceipt();

    },
    [
      printReceipt,
      receipt,
      searchParams,
    ]
  );


  if (
    loading
  ) {

    return (
      <main className="min-h-screen bg-muted/30 p-8">

        <div className="mx-auto max-w-xl rounded-2xl border bg-background p-8">

          Loading POS receipt...

        </div>

      </main>
    );
  }


  if (
    !receipt
  ) {

    return (
      <main className="min-h-screen bg-muted/30 p-8">

        <div className="mx-auto max-w-xl rounded-2xl border bg-background p-8">

          <p className="font-semibold">
            Receipt unavailable
          </p>


          <p className="mt-2 text-sm text-muted-foreground">
            {
              errorMessage ||
              "The POS receipt could not be loaded."
            }
          </p>


          <Button
            type="button"
            className="mt-5"
            onClick={() =>
              router.back()
            }
          >
            Back
          </Button>

        </div>

      </main>
    );
  }


  const saleDate =
    new Intl.DateTimeFormat(
      "en-ZA",
      {
        dateStyle:
          "medium",
        timeStyle:
          "short",
      }
    ).format(
      new Date(
        receipt.sale.created_at
      )
    );


  return (
    <main className="pos-receipt-shell min-h-screen bg-muted/30 px-4 py-6">

      <style>
        {
          `
          @page {
            size: ${paperSize} auto;
            margin: 0;
          }

          @media print {

            html,
            body {
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            body * {
              visibility: hidden !important;
            }

            .pos-receipt-paper,
            .pos-receipt-paper * {
              visibility: visible !important;
            }

            .pos-receipt-paper {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: ${paperSize} !important;
              max-width: ${paperSize} !important;
              margin: 0 !important;
              padding: 3mm !important;
              border: 0 !important;
              box-shadow: none !important;
            }

            .no-print {
              display: none !important;
            }
          }
          `
        }
      </style>


      <div className="no-print mx-auto mb-5 flex max-w-2xl flex-wrap items-center justify-between gap-3">

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              "/pos"
            )
          }
        >
          <ArrowLeft className="mr-2 h-4 w-4" />

          Back to POS
        </Button>


        <div className="flex flex-wrap gap-2">

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                `/invoices/${receipt.sale.invoice_id}`
              )
            }
          >
            <FileText className="mr-2 h-4 w-4" />

            Invoice
          </Button>


          <Button
            type="button"
            onClick={() =>
              void printReceipt()
            }
            disabled={
              printing
            }
          >
            <Printer className="mr-2 h-4 w-4" />

            {
              printing
                ? "Preparing..."
                : receipt.print_count >
                  0
                ? "Reprint"
                : "Print Receipt"
            }
          </Button>

        </div>

      </div>


      {
        errorMessage && (
          <div className="no-print mx-auto mb-4 max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">

            {
              errorMessage
            }

          </div>
        )
      }


      <section
        className="pos-receipt-paper mx-auto bg-white p-4 text-black shadow-lg"
        style={{
          width:
            paperSize,
          maxWidth:
            paperSize,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize:
            paperSize ===
            "58mm"
              ? "10px"
              : "11px",
          lineHeight:
            1.35,
        }}
      >

        {
          reprintMarker && (
            <div className="mb-3 border-y-2 border-black py-1 text-center text-sm font-black">

              ******** REPRINT ********

            </div>
          )
        }


        <header className="text-center">

          <div className="text-lg font-black uppercase">
            {
              receipt
                .company
                .trading_name ||
              receipt
                .company
                .name
            }
          </div>


          {
            receipt
              .company
              .trading_name &&
            receipt
              .company
              .trading_name !==
              receipt
                .company
                .name && (
              <div>
                {
                  receipt
                    .company
                    .name
                }
              </div>
            )
          }


          {
            receipt
              .company
              .address && (
              <div className="mt-1">
                {
                  receipt
                    .company
                    .address
                }
              </div>
            )
          }


          {
            receipt
              .company
              .phone && (
              <div>
                Tel: {
                  receipt
                    .company
                    .phone
                }
              </div>
            )
          }


          {
            receipt
              .company
              .vat_registered &&
            receipt
              .company
              .vat_number && (
              <div>
                VAT: {
                  receipt
                    .company
                    .vat_number
                }
              </div>
            )
          }

        </header>


        <div className="my-3 border-t border-dashed border-black" />


        <div className="space-y-0.5">

          {
            receipt
              .receipt_options
              .show_branch !==
              false &&
            receipt.branch && (
              <div>
                Branch: {
                  receipt
                    .branch
                    .name
                }
              </div>
            )
          }


          <div>
            Receipt: {
              receipt
                .sale
                .sale_number
            }
          </div>


          <div>
            Invoice: {
              receipt
                .invoice
                .number
            }
          </div>


          <div>
            Date: {
              saleDate
            }
          </div>


          {
            receipt
              .receipt_options
              .show_cashier !==
              false &&
            receipt.cashier && (
              <div>
                Cashier: {
                  receipt
                    .cashier
                    .name
                }
              </div>
            )
          }


          {
            receipt.customer && (
              <div>
                Customer: {
                  receipt
                    .customer
                    .name
                }
              </div>
            )
          }

        </div>


        <div className="my-3 border-t border-dashed border-black" />


        <div className="space-y-3">

          {
            receipt.items.map(
              (
                item
              ) => (

                <div
                  key={
                    item.id
                  }
                >

                  <div className="font-bold">
                    {
                      item.description
                    }
                  </div>


                  <div className="flex justify-between gap-3">

                    <span>
                      {
                        quantity(
                          item.quantity
                        )
                      } × {
                        money(
                          item.unit_price
                        )
                      }
                    </span>


                    <span className="font-bold">
                      {
                        money(
                          item.line_total
                        )
                      }
                    </span>

                  </div>


                  {
                    item.price_book_name && (
                      <div className="text-[0.9em]">
                        Price book: {
                          item.price_book_name
                        }
                      </div>
                    )
                  }


                  {
                    item.promotion_name && (
                      <div className="text-[0.9em]">
                        Promotion: {
                          item.promotion_name
                        }
                      </div>
                    )
                  }

                </div>

              )
            )
          }

        </div>


        <div className="my-3 border-t border-dashed border-black" />


        <div className="space-y-1">

          <div className="flex justify-between">

            <span>
              Subtotal
            </span>

            <span>
              {
                money(
                  receipt
                    .invoice
                    .subtotal
                )
              }
            </span>

          </div>


          {
            receipt
              .invoice
              .discount >
              0 && (
              <div className="flex justify-between">

                <span>
                  Discount
                </span>

                <span>
                  -{
                    money(
                      receipt
                        .invoice
                        .discount
                    )
                  }
                </span>

              </div>
            )
          }


          {
            receipt
              .invoice
              .tax >
              0 && (
              <div className="flex justify-between">

                <span>
                  VAT
                </span>

                <span>
                  {
                    money(
                      receipt
                        .invoice
                        .tax
                    )
                  }
                </span>

              </div>
            )
          }


          <div className="mt-2 flex justify-between border-y-2 border-black py-2 text-base font-black">

            <span>
              TOTAL
            </span>

            <span>
              {
                money(
                  receipt
                    .invoice
                    .total
                )
              }
            </span>

          </div>

        </div>


        <div className="mt-3">

          <div className="mb-1 font-bold">
            PAYMENT
          </div>


          {
            receipt.tenders.map(
              (
                tender,
                index
              ) => (

                <div
                  key={
                    tender.id ||
                    `${tender.payment_method}-${index}`
                  }
                  className="flex justify-between"
                >

                  <span className="uppercase">
                    {
                      tender.payment_method
                    }
                  </span>


                  <span>
                    {
                      money(
                        tender.amount
                      )
                    }
                  </span>

                </div>

              )
            )
          }


          {
            receipt
              .sale
              .change_due >
              0 && (
              <div className="mt-1 flex justify-between font-bold">

                <span>
                  Change
                </span>

                <span>
                  {
                    money(
                      receipt
                        .sale
                        .change_due
                    )
                  }
                </span>

              </div>
            )
          }

        </div>


        {
          receipt.total_savings >
            0 && (
            <div className="my-3 border-y border-dashed border-black py-2 text-center font-bold">

              YOU SAVED {
                money(
                  receipt.total_savings
                )
              }

            </div>
          )
        }


        <footer className="mt-4 text-center">

          {
            receipt
              .company
              .footer ? (
              <div>
                {
                  receipt
                    .company
                    .footer
                }
              </div>
            ) : (
              <div>
                Thank you for your business
              </div>
            )
          }


          <div className="mt-2 text-[0.9em]">
            Powered by JINLAB Nexus
          </div>


          {
            receipt.print_count >
              0 && (
              <div className="mt-1 text-[0.8em]">
                Print #{
                  receipt.print_count
                }
              </div>
            )
          }

        </footer>

      </section>

    </main>
  );
}
