import type {
  ReactNode,
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

  const actionIndex =
    headers.findIndex(
      (header) =>
        header
          .trim()
          .toLowerCase() ===
        "actions"
    );


  const normalIndexes =
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
          index !== actionIndex
      );


  const visibleIndexes =
    normalIndexes.slice(
      0,
      2
    );


  const detailIndexes =
    normalIndexes.slice(
      2
    );


  return (
    <>
      {/* ==================================================
          PHONE
          Compact native records instead of desktop tables.
          ================================================== */}
      <div className="space-y-2.5 md:hidden">

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/60 px-5 py-9 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          rows.map(
            (
              row,
              rowIndex
            ) => (

              <article
                key={rowIndex}
                className="min-w-0 overflow-hidden rounded-2xl border border-border/55 bg-card px-3.5 py-3 shadow-sm"
              >

                {/* Primary identity */}
                <div className="min-w-0">
                  <div className="min-w-0 text-[14px] leading-5">
                    {row[0]}
                  </div>
                </div>


                {/* Important fields */}
                {visibleIndexes.length >
                  0 && (
                  <div className="mt-3 grid gap-2">

                    {visibleIndexes.map(
                      (index) => (

                        <div
                          key={
                            index
                          }
                          className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-start gap-2"
                        >

                          <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {
                              headers[
                                index
                              ]
                            }
                          </span>

                          <div className="min-w-0 break-words text-[12px] leading-5">
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
                )}


                {/* Secondary fields stay available without
                    making every record extremely tall. */}
                {detailIndexes.length >
                  0 && (
                  <details className="mt-2.5 border-t border-border/35 pt-2.5">

                    <summary className="cursor-pointer select-none text-[11px] font-semibold text-primary">
                      More details
                    </summary>

                    <div className="mt-2.5 grid gap-2">

                      {detailIndexes.map(
                        (
                          index
                        ) => (

                          <div
                            key={
                              index
                            }
                            className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-start gap-2"
                          >

                            <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {
                                headers[
                                  index
                                ]
                              }
                            </span>

                            <div className="min-w-0 break-words text-[12px] leading-5">
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

                  </details>
                )}


                {/* Keep row actions immediately reachable. */}
                {actionIndex >= 0 &&
                  row[actionIndex] && (
                  <div className="mt-3 min-w-0 border-t border-border/35 pt-3">
                    {
                      row[
                        actionIndex
                      ]
                    }
                  </div>
                )}

              </article>

            )
          )
        )}

      </div>


      {/* ==================================================
          TABLET / DESKTOP
          Existing Nexus table behaviour remains unchanged.
          ================================================== */}
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
