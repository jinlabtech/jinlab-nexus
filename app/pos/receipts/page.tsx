"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  FileText,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type PosSaleRow = {
  id: string;
  sale_number: string;

  invoice_id: string;
  customer_id: string;
  branch_id: string;

  payment_method: string;

  total_amount:
    number |
    string;

  change_due:
    number |
    string;

  status: string;
  created_at: string;
};


type ReceiptRow =
  PosSaleRow & {
    invoice_number: string;
    customer_name: string;
    branch_name: string;
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
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}


function dateTime(
  value: string
) {

  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(
    new Date(
      value
    )
  );
}


function titleCase(
  value: string
) {

  return value
    .replaceAll(
      "_",
      " "
    )
    .split(
      " "
    )
    .filter(
      Boolean
    )
    .map(
      (
        part
      ) =>
        part
          .charAt(
            0
          )
          .toUpperCase() +
        part.slice(
          1
        )
    )
    .join(
      " "
    );
}


export default function PosReceiptsPage() {

  const router =
    useRouter();


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB"
    );


  const [
    userName,
    setUserName,
  ] =
    useState(
      "JINLAB User"
    );


  const [
    receipts,
    setReceipts,
  ] =
    useState<
      ReceiptRow[]
    >(
      []
    );


  const [
    searchTerm,
    setSearchTerm,
  ] =
    useState(
      ""
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


  async function loadReceipts() {

    setLoading(
      true
    );

    setErrorMessage(
      ""
    );


    try {

      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase.auth.getUser();


      if (
        userError ||
        !user
      ) {

        router.replace(
          "/login"
        );

        return;
      }


      const {
        data:
          profile,
      } =
        await supabase
          .from(
            "user_profile"
          )
          .select(
            "full_name, company_id"
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();


      if (
        profile
          ?.full_name
      ) {

        setUserName(
          profile.full_name
        );
      }


      if (
        profile
          ?.company_id
      ) {

        const {
          data:
            company,
        } =
          await supabase
            .from(
              "company"
            )
            .select(
              "company_name"
            )
            .eq(
              "id",
              profile.company_id
            )
            .maybeSingle();


        if (
          company
            ?.company_name
        ) {

          setCompanyName(
            company.company_name
          );
        }

      }


      const {
        data:
          saleData,
        error:
          saleError,
      } =
        await supabase
          .from(
            "pos_sale"
          )
          .select(
            `
              id,
              sale_number,
              invoice_id,
              customer_id,
              branch_id,
              payment_method,
              total_amount,
              change_due,
              status,
              created_at
            `
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          )
          .limit(
            250
          );


      if (
        saleError
      ) {

        throw saleError;
      }


      const sales =
        (
          saleData ??
          []
        ) as
          PosSaleRow[];


      const customerIds =
        [
          ...new Set(
            sales.map(
              (
                sale
              ) =>
                sale.customer_id
            )
          ),
        ];


      const branchIds =
        [
          ...new Set(
            sales.map(
              (
                sale
              ) =>
                sale.branch_id
            )
          ),
        ];


      const invoiceIds =
        [
          ...new Set(
            sales.map(
              (
                sale
              ) =>
                sale.invoice_id
            )
          ),
        ];


      let customerRows:
        {
          id: string;
          customer_name: string;
        }[] =
        [];


      let branchRows:
        {
          id: string;
          branch_name: string;
        }[] =
        [];


      let invoiceRows:
        {
          id: string;
          invoice_number: string;
        }[] =
        [];


      if (
        customerIds.length >
        0
      ) {

        const {
          data,
        } =
          await supabase
            .from(
              "customer"
            )
            .select(
              "id, customer_name"
            )
            .in(
              "id",
              customerIds
            );


        customerRows =
          (
            data ??
            []
          ) as {
            id: string;
            customer_name: string;
          }[];

      }


      if (
        branchIds.length >
        0
      ) {

        const {
          data,
        } =
          await supabase
            .from(
              "branch"
            )
            .select(
              "id, branch_name"
            )
            .in(
              "id",
              branchIds
            );


        branchRows =
          (
            data ??
            []
          ) as {
            id: string;
            branch_name: string;
          }[];

      }


      if (
        invoiceIds.length >
        0
      ) {

        const {
          data,
        } =
          await supabase
            .from(
              "invoice"
            )
            .select(
              "id, invoice_number"
            )
            .in(
              "id",
              invoiceIds
            );


        invoiceRows =
          (
            data ??
            []
          ) as {
            id: string;
            invoice_number: string;
          }[];

      }


      const customerMap =
        new Map(
          customerRows.map(
            (
              row
            ) => [
              row.id,
              row.customer_name,
            ]
          )
        );


      const branchMap =
        new Map(
          branchRows.map(
            (
              row
            ) => [
              row.id,
              row.branch_name,
            ]
          )
        );


      const invoiceMap =
        new Map(
          invoiceRows.map(
            (
              row
            ) => [
              row.id,
              row.invoice_number,
            ]
          )
        );


      setReceipts(
        sales.map(
          (
            sale
          ) => ({
            ...sale,

            customer_name:
              customerMap.get(
                sale.customer_id
              ) ??
              "Walk-in customer",

            branch_name:
              branchMap.get(
                sale.branch_id
              ) ??
              "Branch",

            invoice_number:
              invoiceMap.get(
                sale.invoice_id
              ) ??
              "—",
          })
        )
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof
        Error
          ? error.message
          : "Unable to load POS receipts."
      );

    } finally {

      setLoading(
        false
      );

    }

  }


  useEffect(
    () => {

      void loadReceipts();

    },
    []
  );


  const filteredReceipts =
    useMemo(
      () => {

        const search =
          searchTerm
            .trim()
            .toLowerCase();


        if (
          !search
        ) {

          return receipts;

        }


        return receipts.filter(
          (
            receipt
          ) =>
            receipt
              .sale_number
              .toLowerCase()
              .includes(
                search
              ) ||

            receipt
              .invoice_number
              .toLowerCase()
              .includes(
                search
              ) ||

            receipt
              .customer_name
              .toLowerCase()
              .includes(
                search
              ) ||

            receipt
              .branch_name
              .toLowerCase()
              .includes(
                search
              ) ||

            receipt
              .payment_method
              .toLowerCase()
              .includes(
                search
              )
        );

      },
      [
        receipts,
        searchTerm,
      ]
    );


  async function logout() {

    await supabase.auth.signOut();

    router.replace(
      "/login"
    );

    router.refresh();
  }


  return (
    <DashboardLayout>

      <Navbar
        companyName={
          companyName
        }
        userName={
          userName
        }
        onLogout={
          logout
        }
      />


      <main className="p-4 sm:p-6 lg:p-8">

        <div className="mx-auto max-w-7xl">


          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">

            <div>

              <div className="flex items-center gap-2">

                <ReceiptText className="h-6 w-6" />

                <h1 className="text-2xl font-bold tracking-tight">
                  POS Receipts
                </h1>

              </div>


              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                View completed POS transactions,
                open thermal receipts and manage
                audited receipt reprints.
              </p>

            </div>


            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void loadReceipts()
              }
              disabled={
                loading
              }
            >
              <RefreshCw
                className={
                  `mr-2 h-4 w-4 ${
                    loading
                      ? "animate-spin"
                      : ""
                  }`
                }
              />

              Refresh
            </Button>

          </div>


          <div className="mb-5 rounded-2xl border bg-background p-4 shadow-sm">

            <div className="relative">

              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />


              <input
                type="search"
                value={
                  searchTerm
                }
                onChange={
                  (
                    event
                  ) =>
                    setSearchTerm(
                      event.target.value
                    )
                }
                placeholder="Search receipt, invoice, customer, branch or payment method..."
                className="h-11 w-full rounded-xl border bg-background pl-10 pr-4 text-sm outline-none transition focus:border-primary"
              />

            </div>

          </div>


          {
            errorMessage && (
              <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">

                {
                  errorMessage
                }

              </div>
            )
          }


          <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">

            <div className="border-b px-5 py-4">

              <p className="font-semibold">
                Receipt History
              </p>


              <p className="mt-1 text-xs text-muted-foreground">
                {
                  filteredReceipts.length
                } receipt{
                  filteredReceipts.length ===
                  1
                    ? ""
                    : "s"
                }
              </p>

            </div>


            {
              loading ? (

                <div className="p-8 text-center text-sm text-muted-foreground">

                  Loading POS receipts...

                </div>

              ) : filteredReceipts.length ===
                0 ? (

                <div className="p-10 text-center">

                  <ReceiptText className="mx-auto h-9 w-9 text-muted-foreground" />


                  <p className="mt-3 font-semibold">
                    No receipts found
                  </p>


                  <p className="mt-1 text-sm text-muted-foreground">
                    Completed POS sales will appear here.
                  </p>

                </div>

              ) : (

                <div className="overflow-x-auto">

                  <table className="w-full min-w-[950px] text-left text-sm">

                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">

                      <tr>

                        <th className="px-5 py-3">
                          Receipt
                        </th>

                        <th className="px-5 py-3">
                          Date
                        </th>

                        <th className="px-5 py-3">
                          Customer
                        </th>

                        <th className="px-5 py-3">
                          Branch
                        </th>

                        <th className="px-5 py-3">
                          Payment
                        </th>

                        <th className="px-5 py-3 text-right">
                          Total
                        </th>

                        <th className="px-5 py-3">
                          Status
                        </th>

                        <th className="px-5 py-3 text-right">
                          Actions
                        </th>

                      </tr>

                    </thead>


                    <tbody className="divide-y">

                      {
                        filteredReceipts.map(
                          (
                            receipt
                          ) => (

                            <tr
                              key={
                                receipt.id
                              }
                              className="hover:bg-muted/20"
                            >

                              <td className="px-5 py-4">

                                <p className="font-semibold">
                                  {
                                    receipt.sale_number
                                  }
                                </p>


                                <p className="mt-1 text-xs text-muted-foreground">
                                  Invoice {
                                    receipt.invoice_number
                                  }
                                </p>

                              </td>


                              <td className="whitespace-nowrap px-5 py-4">

                                {
                                  dateTime(
                                    receipt.created_at
                                  )
                                }

                              </td>


                              <td className="px-5 py-4">

                                {
                                  receipt.customer_name
                                }

                              </td>


                              <td className="px-5 py-4">

                                {
                                  receipt.branch_name
                                }

                              </td>


                              <td className="px-5 py-4">

                                <span className="font-medium">
                                  {
                                    titleCase(
                                      receipt.payment_method
                                    )
                                  }
                                </span>

                              </td>


                              <td className="px-5 py-4 text-right font-bold">

                                {
                                  money(
                                    receipt.total_amount
                                  )
                                }

                              </td>


                              <td className="px-5 py-4">

                                <span className="rounded-full border px-2.5 py-1 text-xs font-medium">

                                  {
                                    titleCase(
                                      receipt.status
                                    )
                                  }

                                </span>

                              </td>


                              <td className="px-5 py-4">

                                <div className="flex justify-end gap-2">

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      router.push(
                                        `/invoices/${receipt.invoice_id}`
                                      )
                                    }
                                  >
                                    <FileText className="mr-1.5 h-4 w-4" />

                                    Invoice
                                  </Button>


                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      router.push(
                                        `/pos/receipt/${receipt.id}`
                                      )
                                    }
                                  >
                                    <Printer className="mr-1.5 h-4 w-4" />

                                    Receipt
                                  </Button>

                                </div>

                              </td>

                            </tr>

                          )
                        )
                      }

                    </tbody>

                  </table>

                </div>

              )
            }

          </div>

        </div>

      </main>

    </DashboardLayout>
  );
}
