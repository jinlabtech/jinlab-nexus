import React from "react";

type DataTableProps = {
  headers: string[];
  rows: React.ReactNode[][];
};

export default function DataTable({
  headers,
  rows,
}: DataTableProps) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        marginTop: "20px",
      }}
    >
      <thead>
        <tr>
          {headers.map((header) => (
            <th
              key={header}
              style={{
                border: "1px solid #ddd",
                padding: "12px",
                background: "#f5f5f5",
                textAlign: "left",
              }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                style={{
                  border: "1px solid #ddd",
                  padding: "12px",
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}