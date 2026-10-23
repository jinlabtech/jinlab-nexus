"use client";

import ActionModal from "@/components/ui/ActionModal";

import {
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";


type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
  pageSize?: number;
  compact?: boolean;
};


function subscribeViewport(onChange: () => void) {
  const media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const isPhone = () => window.matchMedia("(max-width: 767px)").matches;
const serverPhone = () => false;

export default function DataTable({
  headers,
  rows,
  emptyMessage = "No records found.",
  pageSize,
  compact = false,
}: DataTableProps) {

  const [
    activeRow,
    setActiveRow,
  ] =
    useState<number | null>(
      null
    );


  const phone = useSyncExternalStore(subscribeViewport, isPhone, serverPhone);
  const [page, setPage] = useState(0);
  const size = pageSize && pageSize > 0 ? pageSize : Math.max(rows.length, 1);
  const lastPage = Math.max(0, Math.ceil(rows.length / size) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * size;
  const visibleRows = rows.slice(start, start + size);

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
      {phone && <div className="space-y-2 md:hidden">

        {rows.length ===
        0 ? (

          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {
              emptyMessage
            }
          </div>

        ) : (

          visibleRows.map(
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
                        start + rowIndex
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

      </div>}


      {/* Portal keeps details above the scrolling workspace and navigation. */}
      <ActionModal open={Boolean(selectedRow)} title="Record details" onClose={()=>setActiveRow(null)} maxWidth="max-w-xl">
        {selectedRow && <>
          <div className="mb-4 break-words text-base font-semibold">{selectedRow[0]}</div>
          <dl className="space-y-3">{dataIndexes.map(index=><div key={index} className="grid min-w-0 grid-cols-[minmax(80px,1fr)_minmax(0,2fr)] gap-3 border-b pb-3 text-sm"><dt className="text-muted-foreground">{headers[index]}</dt><dd className="min-w-0 break-words">{selectedRow[index]}</dd></div>)}</dl>
          {actionIndex>=0 && <div className="mt-4 border-t pt-4" onClick={event=>{
            if(event.target instanceof Element && event.target.closest('button,a[href]'))setActiveRow(null);
          }}><p className="mb-2 text-sm font-semibold">Actions</p>{selectedRow[actionIndex]}</div>}
        </>}
      </ActionModal>

      {/* TABLET / DESKTOP */}
      {!phone && <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">

        <div className="overflow-x-auto" role="region" aria-label="Records table" tabIndex={0}>

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
                      className={`border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${compact ? "px-3 py-3" : "px-5 py-4"}`}
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

                visibleRows.map(
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
                            className={`${compact ? "px-3 py-3 align-top" : "px-5 py-4"} text-sm`}
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

      </div>}
      {lastPage > 0 && <nav aria-label="Table pages" className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
        <span>{start + 1}–{Math.min(start + size, rows.length)} of {rows.length}</span>
        <div className="flex gap-2">
          <button type="button" className="min-h-11 rounded-md border px-4 disabled:opacity-40" disabled={currentPage === 0} onClick={() => { setActiveRow(null); setPage(currentPage - 1); }}>Previous</button>
          <button type="button" className="min-h-11 rounded-md border px-4 disabled:opacity-40" disabled={currentPage === lastPage} onClick={() => { setActiveRow(null); setPage(currentPage + 1); }}>Next</button>
        </div>
      </nav>}
    </>
  );
}
