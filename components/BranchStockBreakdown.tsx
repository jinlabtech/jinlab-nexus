"use client";

import AppCard from "@/components/ui/AppCard";
import { Button } from "@/components/ui/button";

import type { Branch } from "@/types/branch";

import type {
  BranchStock,
  InventoryItem,
} from "@/types/inventory";

type BranchStockBreakdownProps = {
  item: InventoryItem;
  branches: Branch[];
  branchStock: BranchStock[];
  onClose: () => void;
};

export default function BranchStockBreakdown({
  item,
  branches,
  branchStock,
  onClose,
}: BranchStockBreakdownProps) {
  const branchMap = new Map(
    branches.map((branch) => [
      branch.id,
      branch.branch_name,
    ])
  );

  const itemStock =
    branchStock.filter(
      (stock) =>
        stock.inventory_item_id ===
        item.id
    );

  const total =
    itemStock.reduce(
      (sum, stock) =>
        sum + stock.quantity,
      0
    );

  return (
    <AppCard>
      <div className="grid gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Branch Stock Breakdown
            </h2>

            <p className="mt-1 font-medium">
              {item.item_name}
            </p>

            <p className="text-sm text-muted-foreground">
              SKU: {item.sku}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            Total Stock
          </p>

          <p className="mt-1 text-2xl font-bold">
            {total}
          </p>
        </div>

        {itemStock.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            This item currently has no
            stock allocated to any
            branch.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">
                    Branch
                  </th>

                  <th className="px-4 py-3 text-right font-medium">
                    Quantity
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {itemStock.map(
                  (stock) => (
                    <tr
                      key={stock.id}
                    >
                      <td className="px-4 py-3">
                        {branchMap.get(
                          stock.branch_id
                        ) ??
                          "Unknown Branch"}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold">
                        {
                          stock.quantity
                        }
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppCard>
  );
}