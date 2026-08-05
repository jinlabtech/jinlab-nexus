import type { ReactNode } from "react";

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
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="bg-muted/60">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="border-b px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-5 py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-5 py-4 text-sm"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
