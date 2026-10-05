"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FileText,
  LoaderCircle,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  NexusIcon,
  nexusIconForRoute,
} from "@/components/nexus-icons/NexusIcon";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  getNexusSearchEntries,
} from "@/lib/nexus/registry";

import {
  supabase,
} from "@/lib/supabase";


type Props = {
  query: string;
  onOpen: () => void;
};


type CustomerHit = {
  id: string;
  customer_number: string;
  customer_name: string;
  phone?: string | null;
  city?: string | null;
};


type RepairHit = {
  id: string;
  job_number: string;
  status: string;
  customer_name?: string | null;
  brand?: string | null;
  model?: string | null;
  device_type?: string | null;
};


type InventoryHit = {
  id: string;
  item_name: string;
  sku: string;
  barcode?: string | null;
};


type InvoiceHit = {
  id: string;
  invoice_number: string;
  status: string;
  customer_name?: string | null;
};


type EmployeeHit = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  status: string;
};


type NexusRecordSearch = {
  customers?: CustomerHit[];
  repairs?: RepairHit[];
  inventory?: InventoryHit[];
  invoices?: InvoiceHit[];
  employees?: EmployeeHit[];
};


type NexusFile = {
  id: string;
  title: string;
  original_file_name?: string | null;
  file_path?: string | null;
  employee_name?: string | null;
  employee_number?: string | null;
  document_type?: string | null;
  notes?: string | null;
  status?: string | null;
};


type RecordResult = {
  id: string;
  label: string;
  detail: string;
  href: string;
  iconRoute: string;
};


export default function NexusSearchResults({
  query,
  onOpen,
}: Props) {

  const router =
    useRouter();

  const {
    can,
    loading,
  } =
    usePermissions();


  const [
    recordData,
    setRecordData,
  ] =
    useState<NexusRecordSearch>({});


  const [
    files,
    setFiles,
  ] =
    useState<NexusFile[]>([]);


  const [
    searching,
    setSearching,
  ] =
    useState(false);


  const [
    searchError,
    setSearchError,
  ] =
    useState("");


  const term =
    query
      .trim();


  const routeResults =
    useMemo(
      () => {

        const needle =
          term.toLowerCase();


        if (
          !needle ||
          loading
        ) {
          return [];
        }


        return getNexusSearchEntries()
          .filter(
            (entry) =>
              !entry.permission ||
              can(
                entry.permission
              )
          )
          .map(
            (entry) => {

              const label =
                entry.label
                  .toLowerCase();

              const keywords =
                (
                  entry.keywords ??
                  []
                )
                  .join(" ")
                  .toLowerCase();

              const parent =
                (
                  entry.parentLabel ??
                  ""
                )
                  .toLowerCase();

              const href =
                entry.href
                  .toLowerCase();


              let score =
                0;


              if (label === needle) {
                score += 100;
              }

              if (
                label.startsWith(
                  needle
                )
              ) {
                score += 70;
              }

              if (
                label.includes(
                  needle
                )
              ) {
                score += 50;
              }

              if (
                keywords.includes(
                  needle
                )
              ) {
                score += 30;
              }

              if (
                parent.includes(
                  needle
                )
              ) {
                score += 20;
              }

              if (
                href.includes(
                  needle
                )
              ) {
                score += 10;
              }


              return {
                entry,
                score,
              };

            }
          )
          .filter(
            ({ score }) =>
              score > 0
          )
          .sort(
            (a, b) =>
              b.score -
              a.score
          )
          .slice(
            0,
            8
          );

      },
      [
        term,
        can,
        loading,
      ]
    );


  useEffect(
    () => {

      if (
        term.length <
        2 ||
        loading
      ) {

        setRecordData({});
        setFiles([]);
        setSearching(false);
        setSearchError("");

        return;
      }


      let cancelled =
        false;


      const timer =
        window.setTimeout(
          async () => {

            setSearching(true);
            setSearchError("");


            const recordPromise =
              supabase.rpc(
                "nexus_ai_search",
                {
                  p_query:
                    term,

                  p_limit:
                    6,
                }
              );


            const filePromise =
              can(
                "hr.documents.manage"
              )
                ? supabase.rpc(
                    "get_hr_documents_workspace",
                    {
                      p_employee_id:
                        null,
                    }
                  )
                : Promise.resolve({
                    data:
                      null,
                    error:
                      null,
                  });


            const [
              recordResult,
              fileResult,
            ] =
              await Promise.all([
                recordPromise,
                filePromise,
              ]);


            if (cancelled) {
              return;
            }


            if (
              recordResult.error
            ) {

              setRecordData({});

              setSearchError(
                "Some Nexus records could not be searched."
              );

            } else {

              setRecordData(
                (
                  recordResult.data ??
                  {}
                ) as NexusRecordSearch
              );
            }


            if (
              !fileResult.error &&
              fileResult.data
            ) {

              const allFiles =
                (
                  (
                    fileResult.data as {
                      documents?:
                        NexusFile[];
                    }
                  ).documents ??
                  []
                );


              const needle =
                term.toLowerCase();


              setFiles(
                allFiles
                  .filter(
                    (file) =>
                      [
                        file.title,
                        file.original_file_name,
                        file.employee_name,
                        file.employee_number,
                        file.document_type,
                        file.notes,
                      ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase()
                        .includes(
                          needle
                        )
                  )
                  .slice(
                    0,
                    6
                  )
              );

            } else {

              setFiles([]);

            }


            setSearching(false);

          },
          180
        );


      return () => {

        cancelled =
          true;

        window.clearTimeout(
          timer
        );

      };

    },
    [
      term,
      loading,
      can,
    ]
  );


  const records =
    useMemo<RecordResult[]>(
      () => [

        ...(
          recordData.customers ??
          []
        ).map(
          (row) => ({
            id:
              `customer-${row.id}`,

            label:
              row.customer_name,

            detail:
              [
                row.customer_number,
                row.phone,
                row.city,
              ]
                .filter(Boolean)
                .join(" · "),

            href:
              "/customers",

            iconRoute:
              "/customers",
          })
        ),


        ...(
          recordData.repairs ??
          []
        ).map(
          (row) => ({
            id:
              `repair-${row.id}`,

            label:
              row.job_number,

            detail:
              [
                row.customer_name,
                [
                  row.brand,
                  row.model,
                  row.device_type,
                ]
                  .filter(Boolean)
                  .join(" "),
                row.status
                  ?.replaceAll(
                    "_",
                    " "
                  ),
              ]
                .filter(Boolean)
                .join(" · "),

            href:
              "/repairs/scanner",

            iconRoute:
              "/repairs/scanner",
          })
        ),


        ...(
          recordData.inventory ??
          []
        ).map(
          (row) => ({
            id:
              `inventory-${row.id}`,

            label:
              row.item_name,

            detail:
              [
                row.sku,
                row.barcode,
              ]
                .filter(Boolean)
                .join(" · "),

            href:
              "/inventory",

            iconRoute:
              "/inventory",
          })
        ),


        ...(
          recordData.invoices ??
          []
        ).map(
          (row) => ({
            id:
              `invoice-${row.id}`,

            label:
              row.invoice_number,

            detail:
              [
                row.customer_name,
                row.status
                  ?.replaceAll(
                    "_",
                    " "
                  ),
              ]
                .filter(Boolean)
                .join(" · "),

            href:
              `/invoices/${row.id}`,

            iconRoute:
              "/invoices",
          })
        ),


        ...(
          recordData.employees ??
          []
        ).map(
          (row) => ({
            id:
              `employee-${row.id}`,

            label:
              [
                row.first_name,
                row.last_name,
              ]
                .filter(Boolean)
                .join(" "),

            detail:
              [
                row.employee_number,
                row.status,
              ]
                .filter(Boolean)
                .join(" · "),

            href:
              "/hr",

            iconRoute:
              "/hr",
          })
        ),

      ],
      [
        recordData,
      ]
    );


  async function openFile(
    file:
      NexusFile
  ) {

    onOpen();


    if (!file.file_path) {

      router.push(
        "/hr/documents"
      );

      return;
    }


    const {
      data,
      error,
    } =
      await supabase
        .storage
        .from(
          "hr-documents"
        )
        .createSignedUrl(
          file.file_path,
          300
        );


    if (
      error ||
      !data?.signedUrl
    ) {

      router.push(
        "/hr/documents"
      );

      return;
    }


    window.location.assign(
      data.signedUrl
    );
  }


  const nothingFound =
    !searching &&
    routeResults.length ===
      0 &&
    records.length ===
      0 &&
    files.length ===
      0;


  if (!term) {
    return null;
  }


  return (
    <div className="mt-4 space-y-5">

      {
        routeResults.length >
        0 && (
          <section>

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Apps & actions
            </p>


            <div className="space-y-1">

              {
                routeResults.map(
                  ({
                    entry,
                  }) => (

                    <button
                      key={
                        entry.id
                      }
                      type="button"
                      onClick={() => {

                        router.push(
                          entry.href
                        );

                        onOpen();

                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-muted active:scale-[0.985]"
                    >

                      <NexusIcon
                        name={
                          nexusIconForRoute(
                            entry.href
                          )
                        }
                        size="sm"
                      />


                      <span className="min-w-0 flex-1">

                        <span className="block truncate text-sm font-medium">
                          {
                            entry.label
                          }
                        </span>


                        {
                          entry.parentLabel ? (
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {
                                entry.parentLabel
                              }
                            </span>
                          ) : null
                        }

                      </span>

                    </button>

                  )
                )
              }

            </div>

          </section>
        )
      }


      {
        records.length >
        0 && (
          <section>

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Business records
            </p>


            <div className="space-y-1">

              {
                records
                  .slice(
                    0,
                    12
                  )
                  .map(
                    (record) => (

                      <button
                        key={
                          record.id
                        }
                        type="button"
                        onClick={() => {

                          router.push(
                            record.href
                          );

                          onOpen();

                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-muted active:scale-[0.985]"
                      >

                        <NexusIcon
                          name={
                            nexusIconForRoute(
                              record.iconRoute
                            )
                          }
                          size="sm"
                        />


                        <span className="min-w-0 flex-1">

                          <span className="block truncate text-sm font-medium">
                            {
                              record.label
                            }
                          </span>

                          <span className="block truncate text-[10px] text-muted-foreground">
                            {
                              record.detail
                            }
                          </span>

                        </span>

                      </button>

                    )
                  )
              }

            </div>

          </section>
        )
      }


      {
        files.length >
        0 && (
          <section>

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Files
            </p>


            <div className="space-y-1">

              {
                files.map(
                  (file) => (

                    <button
                      key={
                        file.id
                      }
                      type="button"
                      onClick={() =>
                        void openFile(
                          file
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-muted active:scale-[0.985]"
                    >

                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <FileText className="size-4" />
                      </span>


                      <span className="min-w-0 flex-1">

                        <span className="block truncate text-sm font-medium">
                          {
                            file.title
                          }
                        </span>

                        <span className="block truncate text-[10px] text-muted-foreground">
                          {
                            [
                              file.original_file_name,
                              file.employee_name,
                              file.document_type
                                ?.replaceAll(
                                  "_",
                                  " "
                                ),
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          }
                        </span>

                      </span>

                    </button>

                  )
                )
              }

            </div>

          </section>
        )
      }


      {
        searching && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">

            <LoaderCircle className="size-4 animate-spin" />

            Searching Nexus...

          </div>
        )
      }


      {
        searchError && (
          <p className="px-2 text-xs text-muted-foreground">
            {
              searchError
            }
          </p>
        )
      }


      {
        nothingFound && (
          <div className="rounded-2xl border border-dashed border-border/50 px-5 py-8 text-center">

            <p className="text-sm font-medium">
              Nothing found
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Try a customer, Job Card, barcode, invoice, employee, file or application.
            </p>

          </div>
        )
      }

    </div>
  );
}
