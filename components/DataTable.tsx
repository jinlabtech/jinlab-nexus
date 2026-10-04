"use client";

import {
  useState,
  type ReactNode,
} from "react";


type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
};


export default function DataTable({
  headers,
  rows,
  emptyMessage = "No records found.",
}: DataTableProps) {

  const [
    activeRow,
    setActiveRow,
  ] =
    useState<number | null>(
      null
    );


  const actionIndex =
    headers.findIndex(
      (header) =>
        header
          .trim()
          .toLowerCase() ===
        "actions"
    );


  const dataIndexes =
    headers
      .map(
        (
          _,
          index
        ) => index
      )
      .filter(
        (index) =>
          index !== 0 &&
          index !==
            actionIndex
      );


  const previewIndexes =
    dataIndexes.slice(
      0,
      2
    );


  const selectedRow =
    activeRow === null
      ? null
      : rows[
          activeRow
        ];


  return (
    <>

      {/* PHONE RECORDS */}
      <div className="space-y-2 md:hidden">

        {rows.length ===
        0 ? (

          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {
              emptyMessage
            }
          </div>

        ) : (

          rows.map(
            (
              row,
              rowIndex
            ) => (

              <article
                key={
                  rowIndex
                }
                className="nexus-mobile-record-card rounded-xl border bg-card px-3 py-2.5"
              >

                <div className="flex min-w-0 items-start gap-3">

                  <div className="min-w-0 flex-1">

                    <div className="min-w-0 text-[13px] font-semibold leading-5">
                      {
                        row[
                          0
                        ]
                      }
                    </div>


                    {previewIndexes.map(
                      (
                        index
                      ) => (

                        <div
                          key={
                            index
                          }
                          className="mt-1 grid min-w-0 grid-cols-[68px_minmax(0,1fr)] gap-1.5 text-[10px] leading-4"
                        >

                          <span className="truncate text-muted-foreground">
                            {
                              headers[
                                index
                              ]
                            }
                          </span>

                          <div className="min-w-0 truncate">
                            {
                              row[
                                index
                              ]
                            }
                          </div>

                        </div>

                      )
                    )}

                  </div>


                  <button
                    type="button"
                    onClick={() =>
                      setActiveRow(
                        rowIndex
                      )
                    }
                    className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 text-[11px] font-semibold text-primary active:scale-95"
                  >
                    View
                  </button>

                </div>

              </article>

            )
          )
        )}

      </div>


      {/* PHONE DETAILS SHEET */}
      {selectedRow && (

        <div
          className="nexus-mobile-record-sheet fixed inset-0 z-[230] flex items-end bg-black/35 md:hidden"
          onMouseDown={
            (
              event
            ) => {

              if (
                event.target ===
                event.currentTarget
              ) {
                setActiveRow(
                  null
                );
              }

            }
          }
        >

          <section className="w-full overflow-hidden rounded-t-[20px] bg-background shadow-2xl">

            <header className="flex min-h-[52px] items-center justify-between gap-3 border-b px-4 py-2.5">

              <div className="min-w-0 flex-1">

                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Details
                </p>

                <div className="mt-0.5 min-w-0 text-sm font-semibold">
                  {
                    selectedRow[
                      0
                    ]
                  }
                </div>

              </div>


              <button
                type="button"
                onClick={() =>
                  setActiveRow(
                    null
                  )
                }
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg"
                aria-label="Close details"
              >
                ×
              </button>

            </header>


            <div className="max-h-[62dvh] overflow-y-auto px-4 py-3">

              <div className="grid gap-1">

                {dataIndexes.map(
                  (
                    index
                  ) => (

                    <div
                      key={
                        index
                      }
                      className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-border/35 py-2 text-[12px] last:border-0"
                    >

                      <span className="text-muted-foreground">
                        {
                          headers[
                            index
                          ]
                        }
                      </span>

                      <div className="min-w-0 break-words font-medium">
                        {
                          selectedRow[
                            index
                          ]
                        }
                      </div>

                    </div>

                  )
                )}

              </div>


              {actionIndex >=
                0 &&
                selectedRow[
                  actionIndex
                ] && (

                <div className="mt-3 border-t pt-3">

                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Actions
                  </p>

                  <div className="min-w-0">
                    {
                      selectedRow[
                        actionIndex
                      ]
                    }
                  </div>

                </div>

              )}

            </div>

          </section>

        </div>

      )}


      {/* TABLET / DESKTOP */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[760px] border-collapse">

            <thead className="bg-muted/60">

              <tr>

                {headers.map(
                  (
                    header
                  ) => (

                    <th
                      key={
                        header
                      }
                      className="border-b px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {
                        header
                      }
                    </th>

                  )
                )}

              </tr>

            </thead>


            <tbody>

              {rows.length ===
              0 ? (

                <tr>

                  <td
                    colSpan={
                      headers.length
                    }
                    className="px-5 py-12 text-center text-sm text-muted-foreground"
                  >
                    {
                      emptyMessage
                    }
                  </td>

                </tr>

              ) : (

                rows.map(
                  (
                    row,
                    rowIndex
                  ) => (

                    <tr
                      key={
                        rowIndex
                      }
                      className="border-b last:border-b-0 hover:bg-muted/30"
                    >

                      {row.map(
                        (
                          cell,
                          cellIndex
                        ) => (

                          <td
                            key={
                              cellIndex
                            }
                            className="px-5 py-4 text-sm"
                          >
                            {
                              cell
                            }
                          </td>

                        )
                      )}

                    </tr>

                  )
                )

              )}

            </tbody>

          </table>

        </div>

      </div>

    </>
  );
}
