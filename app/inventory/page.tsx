"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/DataTable";
import BranchStockBreakdown from "@/components/BranchStockBreakdown";
import InventoryItemForm from "@/components/InventoryItemForm";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import StockAdjustmentForm from "@/components/StockAdjustmentForm";
import { Button } from "@/components/ui/button";

import { useBranches } from "@/hooks/useBranches";
import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";

import {
  adjustStock,
  createInventoryItem,
  deactivateInventoryItem,
  updateInventoryItem,
} from "@/lib/services/inventoryService";

import { supabase } from "@/lib/supabase";

import type {
  InventoryItem,
  InventoryItemFormData,
  StockAdjustmentData,
} from "@/types/inventory";

type NewInventoryItemData = {
  item: InventoryItemFormData;
  branch_id: string;
  initial_stock: number;
};

function formatCurrency(
  value: number
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(value);
}

export default function InventoryPage() {
  const router = useRouter();

  const [
    currentCompanyId,
    setCurrentCompanyId,
  ] = useState("");

  const [
    companyName,
    setCompanyName,
  ] = useState("JINLAB");

  const [
    userName,
    setUserName,
  ] = useState("JINLAB Admin");

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    showItemForm,
    setShowItemForm,
  ] = useState(false);

  const [
    stockItem,
    setStockItem,
  ] = useState<InventoryItem | null>(null);

  const [
    editingItem,
    setEditingItem,
  ] = useState<InventoryItem | null>(null);

  const [
    breakdownItem,
    setBreakdownItem,
  ] = useState<InventoryItem | null>(null);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState("");

  const {
    items,
    categories,
    suppliers,
    branchStock,
    loading,
    errorMessage:
      inventoryError,
    refreshInventory,
  } = useInventory(
    currentCompanyId
  );

  const {
    branches,
    loading: branchesLoading,
  } = useBranches(
    currentCompanyId
  );

  const {
    can,
    loading:
      permissionsLoading,
    errorMessage:
      permissionsError,
  } = usePermissions();

  useEffect(() => {
    async function initialisePage() {
      const {
        data: { user },
        error: userError,
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
        data: profileData,
        error:
          profileError,
      } = await supabase
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
        .single();

      if (profileError) {
        setPageError(
          profileError.message
        );
        return;
      }

      if (
        profileData?.full_name
      ) {
        setUserName(
          profileData.full_name
        );
      }

      if (
        !profileData?.company_id
      ) {
        setPageError(
          "Your account is not linked to a company."
        );
        return;
      }

      setCurrentCompanyId(
        profileData.company_id
      );

      const {
        data: companyData,
        error:
          companyError,
      } = await supabase
        .from("company")
        .select(
          "company_name"
        )
        .eq(
          "id",
          profileData.company_id
        )
        .single();

      if (companyError) {
        setPageError(
          companyError.message
        );
        return;
      }

      if (
        companyData?.company_name
      ) {
        setCompanyName(
          companyData.company_name
        );
      }
    }

    initialisePage();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }

  function openAddItem() {
    setEditingItem(null);
    setBreakdownItem(null);
    setStockItem(null);

    if (
      !can(
        "inventory.create"
      )
    ) {
      setPageError(
        "You do not have permission to create inventory items."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setShowItemForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeAddItem() {
    setShowItemForm(false);
    setEditingItem(null);
  }

  function openEditItem(
    item: InventoryItem
  ) {
    if (
      !can(
        "inventory.update"
      )
    ) {
      setPageError(
        "You do not have permission to edit inventory items."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setStockItem(null);
    setBreakdownItem(null);
    setEditingItem(item);
    setShowItemForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openBreakdown(
    item: InventoryItem
  ) {
    setMessage("");
    setPageError("");
    setShowItemForm(false);
    setEditingItem(null);
    setStockItem(null);
    setBreakdownItem(item);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeBreakdown() {
    setBreakdownItem(null);
  }

  async function saveEditedItem(
    data: {
      item: InventoryItemFormData;
      branch_id: string;
      initial_stock: number;
    }
  ) {
    if (
      !currentCompanyId ||
      !editingItem
    ) {
      throw new Error(
        "The inventory item could not be identified."
      );
    }

    if (
      !can(
        "inventory.update"
      )
    ) {
      throw new Error(
        "You do not have permission to update inventory items."
      );
    }

    const updated =
      await updateInventoryItem(
        editingItem.id,
        currentCompanyId,
        data.item
      );

    try {
      await createAuditLog({
        company_id:
          currentCompanyId,

        action: "update",

        module: "inventory",

        record_id:
          updated.id,

        description:
          `Updated inventory item: ${updated.item_name}`,

        metadata: {
          item_name:
            updated.item_name,

          sku:
            updated.sku,

          cost_price:
            updated.cost_price,

          selling_price:
            updated.selling_price,

          minimum_stock:
            updated.minimum_stock,
        },
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? `Item updated, but audit logging failed: ${error.message}`
          : "Item updated, but audit logging failed."
      );
    }

    setEditingItem(null);
    setShowItemForm(false);

    setMessage(
      `${updated.item_name} updated successfully.`
    );

    await refreshInventory();
  }

  async function archiveItem(
    item: InventoryItem
  ) {
    if (
      !can(
        "inventory.delete"
      )
    ) {
      setPageError(
        "You do not have permission to archive inventory items."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Archive "${item.item_name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateInventoryItem(
        item.id,
        currentCompanyId
      );

      try {
        await createAuditLog({
          company_id:
            currentCompanyId,

          action: "delete",

          module: "inventory",

          record_id:
            item.id,

          description:
            `Archived inventory item: ${item.item_name}`,

          metadata: {
            item_name:
              item.item_name,

            sku:
              item.sku,
          },
        });
      } catch (error) {
        setPageError(
          error instanceof Error
            ? `Item archived, but audit logging failed: ${error.message}`
            : "Item archived, but audit logging failed."
        );
      }

      setMessage(
        `${item.item_name} archived successfully.`
      );

      await refreshInventory();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "The item could not be archived."
      );
    }
  }

  function openStockAdjustment(
    item: InventoryItem
  ) {
    if (
      !can(
        "inventory.stock.adjust"
      )
    ) {
      setPageError(
        "You do not have permission to adjust stock."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setShowItemForm(false);
    setStockItem(item);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeStockAdjustment() {
    setStockItem(null);
  }

  async function saveStockAdjustment(
    adjustment: StockAdjustmentData
  ) {
    if (!currentCompanyId) {
      throw new Error(
        "Your account is not linked to a company."
      );
    }

    if (
      !can(
        "inventory.stock.adjust"
      )
    ) {
      throw new Error(
        "You do not have permission to adjust stock."
      );
    }

    if (!stockItem) {
      throw new Error(
        "The inventory item could not be identified."
      );
    }

    await adjustStock(
      currentCompanyId,
      adjustment
    );

    try {
      await createAuditLog({
        company_id:
          currentCompanyId,

        action: "update",

        module:
          "inventory",

        record_id:
          stockItem.id,

        description:
          `Stock ${adjustment.movement_type}: ${stockItem.item_name}`,

        metadata: {
          item_name:
            stockItem.item_name,

          sku:
            stockItem.sku,

          movement_type:
            adjustment.movement_type,

          quantity:
            adjustment.quantity,

          branch_id:
            adjustment.branch_id,

          reference:
            adjustment.reference ??
            null,
        },
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? `Stock updated, but audit logging failed: ${error.message}`
          : "Stock updated, but audit logging failed."
      );
    }

    setMessage(
      `${stockItem.item_name} stock updated successfully.`
    );

    setStockItem(null);

    await refreshInventory();
  }

  async function saveNewItem(
    data: NewInventoryItemData
  ) {
    if (
      !currentCompanyId
    ) {
      throw new Error(
        "Your account is not linked to a company."
      );
    }

    if (
      !can(
        "inventory.create"
      )
    ) {
      throw new Error(
        "You do not have permission to create inventory items."
      );
    }

    const createdItem =
      await createInventoryItem(
        currentCompanyId,
        data.item
      );

    if (
      data.initial_stock > 0
    ) {
      if (
        !can(
          "inventory.stock.adjust"
        )
      ) {
        throw new Error(
          "The item was created, but you do not have permission to add opening stock."
        );
      }

      await adjustStock(
        currentCompanyId,
        {
          branch_id:
            data.branch_id,

          inventory_item_id:
            createdItem.id,

          movement_type:
            "stock_in",

          quantity:
            data.initial_stock,

          reference:
            "OPENING-STOCK",

          notes:
            "Opening stock added when inventory item was created.",
        }
      );
    }

    try {
      await createAuditLog({
        company_id:
          currentCompanyId,

        action: "create",

        module:
          "inventory",

        record_id:
          createdItem.id,

        description:
          `Created inventory item: ${createdItem.item_name}`,

        metadata: {
          sku:
            createdItem.sku,

          barcode:
            createdItem.barcode,

          cost_price:
            createdItem.cost_price,

          selling_price:
            createdItem.selling_price,

          minimum_stock:
            createdItem.minimum_stock,

          opening_stock:
            data.initial_stock,

          opening_branch:
            data.branch_id ||
            null,
        },
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? `Inventory item created, but audit logging failed: ${error.message}`
          : "Inventory item created, but audit logging failed."
      );
    }

    setShowItemForm(false);

    setMessage(
      `${createdItem.item_name} added successfully.`
    );

    await refreshInventory();
  }

  const stockByItem =
    useMemo(() => {
      const map =
        new Map<
          string,
          number
        >();

      for (
        const stock of
        branchStock
      ) {
        const current =
          map.get(
            stock.inventory_item_id
          ) ?? 0;

        map.set(
          stock.inventory_item_id,
          current +
            stock.quantity
        );
      }

      return map;
    }, [branchStock]);

  const totalStockUnits =
    useMemo(() => {
      return branchStock.reduce(
        (
          total,
          stock
        ) =>
          total +
          stock.quantity,
        0
      );
    }, [branchStock]);

  const totalStockValue =
    useMemo(() => {
      return items.reduce(
        (total, item) => {
          const quantity =
            stockByItem.get(
              item.id
            ) ?? 0;

          return (
            total +
            quantity *
              Number(
                item.cost_price
              )
          );
        },
        0
      );
    }, [
      items,
      stockByItem,
    ]);

  const totalRetailValue =
    useMemo(() => {
      return items.reduce(
        (total, item) => {
          const quantity =
            stockByItem.get(
              item.id
            ) ?? 0;

          return (
            total +
            quantity *
              Number(
                item.selling_price
              )
          );
        },
        0
      );
    }, [
      items,
      stockByItem,
    ]);

  const lowStockItems =
    useMemo(() => {
      return items.filter(
        (item) => {
          const quantity =
            stockByItem.get(
              item.id
            ) ?? 0;

          return (
            quantity <=
            item.minimum_stock
          );
        }
      );
    }, [
      items,
      stockByItem,
    ]);

  const categoryMap =
    useMemo(() => {
      return new Map(
        categories.map(
          (category) => [
            category.id,
            category.category_name,
          ]
        )
      );
    }, [categories]);

  const supplierMap =
    useMemo(() => {
      return new Map(
        suppliers.map(
          (supplier) => [
            supplier.id,
            supplier.supplier_name,
          ]
        )
      );
    }, [suppliers]);

  const filteredItems =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return items;
      }

      return items.filter(
        (item) =>
          [
            item.item_name,
            item.sku,
            item.barcode,
            item.description,

            item.category_id
              ? categoryMap.get(
                  item.category_id
                )
              : "",

            item.supplier_id
              ? supplierMap.get(
                  item.supplier_id
                )
              : "",
          ].some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(
                  search
                )
          )
      );
    }, [
      items,
      searchTerm,
      categoryMap,
      supplierMap,
    ]);

  const rows =
    filteredItems.map(
      (item) => {
        const quantity =
          stockByItem.get(
            item.id
          ) ?? 0;

        const isLowStock =
          quantity <=
          item.minimum_stock;

        return [
          <div
            key={`${item.id}-item`}
          >
            <p className="font-semibold">
              {
                item.item_name
              }
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              SKU:{" "}
              {item.sku}
            </p>
          </div>,

          item.category_id
            ? categoryMap.get(
                item.category_id
              ) ?? "-"
            : "-",

          item.supplier_id
            ? supplierMap.get(
                item.supplier_id
              ) ?? "-"
            : "-",

          <span
            key={`${item.id}-stock`}
            className={
              isLowStock
                ? "inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
                : "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
            }
          >
            {quantity}
          </span>,

          formatCurrency(
            Number(
              item.cost_price
            )
          ),

          formatCurrency(
            Number(
              item.selling_price
            )
          ),

          `${
            Number(item.selling_price) > 0
              ? (
                  (
                    (
                      Number(item.selling_price) -
                      Number(item.cost_price)
                    ) /
                    Number(item.selling_price)
                  ) * 100
                ).toFixed(1)
              : "0.0"
          }%`,

          item.barcode ||
            "-",

          <div
            key={`${item.id}-actions`}
            className="flex flex-wrap gap-2"
          >
            {can(
              "inventory.update"
            ) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  openEditItem(
                    item
                  )
                }
              >
                Edit
              </Button>
            )}

            {can(
              "inventory.stock.adjust"
            ) && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  openStockAdjustment(
                    item
                  )
                }
              >
                Stock
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                openBreakdown(
                  item
                )
              }
            >
              Breakdown
            </Button>

            {can(
              "inventory.delete"
            ) && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() =>
                  archiveItem(
                    item
                  )
                }
              >
                Archive
              </Button>
            )}
          </div>,
        ];
      }
    );

  const visibleError =
    pageError ||
    inventoryError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can(
      "inventory.view"
    )
  ) {
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
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            <h1 className="text-xl font-semibold">
              Access denied
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              You do not have
              permission to view
              the Inventory
              module.
            </p>
          </div>
        </main>
      </DashboardLayout>
    );
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
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Stock management
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Inventory
            </h1>

            <p className="mt-2 text-muted-foreground">
              Monitor products,
              stock levels,
              suppliers and
              inventory value
              for {companyName}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/inventory/categories"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Categories
            </Link>

            {can("supplier.view") && (
              <Link
                href="/inventory/suppliers"
                className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
              >
                Suppliers
              </Link>
            )}

            <Link
              href="/inventory/movements"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Movements
            </Link>

            <Link
              href="/inventory/archived"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Archived
            </Link>

            {can("inventory.create") &&
              !showItemForm && (
                <Button
                  type="button"
                  onClick={openAddItem}
                >
                  + Add Item
                </Button>
              )}
          </div>
        </section>

        {message && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {visibleError}
          </div>
        )}

        {showItemForm && (
          <div className="mb-8">
            <InventoryItemForm
              item={
                editingItem
              }
              categories={
                categories
              }
              suppliers={
                suppliers
              }
              branches={
                branches
              }
              onSave={
                editingItem
                  ? saveEditedItem
                  : saveNewItem
              }
              onCancel={
                closeAddItem
              }
            />
          </div>
        )}

        {stockItem && (
          <div className="mb-8">
            <StockAdjustmentForm
              item={stockItem}
              branches={branches}
              onSave={
                saveStockAdjustment
              }
              onCancel={
                closeStockAdjustment
              }
            />
          </div>
        )}

        {breakdownItem && (
          <div className="mb-8">
            <BranchStockBreakdown
              item={
                breakdownItem
              }
              branches={
                branches
              }
              branchStock={
                branchStock
              }
              onClose={
                closeBreakdown
              }
            />
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Products
            </p>

            <p className="mt-2 text-2xl font-bold">
              {items.length}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Stock Units
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                totalStockUnits
              }
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Cost Value
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                totalStockValue
              )}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Retail Value
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                totalRetailValue
              )}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Low Stock
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                lowStockItems.length
              }
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Categories
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                categories.length
              }
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Suppliers
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                suppliers.length
              }
            </p>
          </div>
        </section>

        <section className="mt-8 mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Inventory items
            </p>

            <p className="text-sm text-muted-foreground">
              {
                filteredItems.length
              }{" "}
              result
              {filteredItems.length ===
              1
                ? ""
                : "s"}
            </p>
          </div>

          <input
            type="search"
            value={
              searchTerm
            }
            onChange={(
              event
            ) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search inventory..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading ||
        branchesLoading ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading
            inventory...
          </div>
        ) : (
          <DataTable
            headers={[
              "Item",
              "Category",
              "Supplier",
              "Stock",
              "Cost",
              "Selling Price",
              "Margin",
              "Barcode",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No inventory items match your search."
          />
        )}
      </main>
    </DashboardLayout>
  );
}