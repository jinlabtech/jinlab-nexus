"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import Code128Barcode from "@/components/Code128Barcode";
import { Button } from "@/components/ui/button";

import { usePermissions } from "@/hooks/usePermissions";

import {
  generateInventoryBarcode,
  getInventoryBarcodeLabels,
  getInventoryBarcodeWorkspace,
} from "@/lib/services/inventoryBarcodeService";

import type {
  InventoryBarcodeLabel,
  InventoryBarcodeWorkspace,
} from "@/lib/services/inventoryBarcodeService";

import { supabase } from "@/lib/supabase";

type InventoryLabelItem = {
  id: string;
  item_name: string;
  sku: string;
  barcode: string | null;
  selling_price: number;
};

type LabelPreset = {
  id: string;
  name: string;
  width: number;
  height: number;
};

const presets: LabelPreset[] = [
  { id: "50x30", name: "50 × 30 mm", width: 50, height: 30 },
  { id: "40x30", name: "40 × 30 mm", width: 40, height: 30 },
  { id: "50x25", name: "50 × 25 mm", width: 50, height: 25 },
  { id: "60x40", name: "60 × 40 mm", width: 60, height: 40 },
];

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function InventoryLabelsPage() {
  const router = useRouter();

  const {
    can,
    loading: permissionsLoading,
  } = usePermissions();

  const [companyName, setCompanyName] = useState("JINLAB");
  const [userName, setUserName] = useState("Admin");
  const [items, setItems] = useState<InventoryLabelItem[]>([]);
  const [workspace, setWorkspace] =
    useState<InventoryBarcodeWorkspace | null>(null);

  const [selected, setSelected] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<InventoryBarcodeLabel[]>([]);
  const [search, setSearch] = useState("");
  const [presetId, setPresetId] = useState("50x30");
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  const preset = presets.find((item) => item.id === presetId) ?? presets[0];

  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profile")
        .select("company_id, full_name")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile?.company_id) {
        throw new Error("Company profile could not be loaded.");
      }

      if (profile.full_name) setUserName(profile.full_name);

      const [companyResult, inventoryResult, workspaceResult] =
        await Promise.all([
          supabase
            .from("company")
            .select("company_name")
            .eq("id", profile.company_id)
            .single(),

          supabase
            .from("inventory_item")
            .select("id, item_name, sku, barcode, selling_price")
            .eq("company_id", profile.company_id)
            .eq("is_active", true)
            .order("item_name", { ascending: true }),

          getInventoryBarcodeWorkspace(),
        ]);

      if (companyResult.error) throw new Error(companyResult.error.message);
      if (inventoryResult.error) throw new Error(inventoryResult.error.message);

      setCompanyName(companyResult.data.company_name);
      setItems((inventoryResult.data ?? []) as InventoryLabelItem[]);
      setWorkspace(workspaceResult);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Barcode labels could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (permissionsLoading) return;

    if (!can("inventory.view")) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };

    // Permission state is intentionally the gate for initial loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return items;

    return items.filter((item) =>
      [item.item_name, item.sku, item.barcode || ""].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [items, search]);

  const selectedEntries = Object.entries(selected) as Array<[string, number]>;

  const selectedCount = selectedEntries.filter(
    ([, copies]) => copies > 0
  ).length;

  const totalCopies = selectedEntries.reduce(
    (sum, [, copies]) => sum + Math.max(0, Number(copies || 0)),
    0
  );

  const expandedLabels = useMemo(
    () =>
      labels.flatMap((label) =>
        Array.from({ length: Math.max(1, label.copies) }, (_, index) => ({
          ...label,
          printKey: `${label.id}-${index}`,
        }))
      ),
    [labels]
  );

  function toggleItem(item: InventoryLabelItem) {
    if (!item.barcode) return;

    setSelected((current) => {
      if (current[item.id]) {
        const next = { ...current };
        delete next[item.id];
        return next;
      }

      return {
        ...current,
        [item.id]: 1,
      };
    });

    setLabels([]);
  }

  function setCopies(itemId: string, copies: number) {
    setSelected((current) => ({
      ...current,
      [itemId]: Math.max(1, Math.min(999, Math.floor(copies || 1))),
    }));

    setLabels([]);
  }

  async function generate(item: InventoryLabelItem) {
    if (!can("inventory.update")) {
      setErrorMessage(
        "You do not have permission to generate inventory barcodes."
      );
      return;
    }

    try {
      setBusyItemId(item.id);
      setErrorMessage("");
      setMessage("");

      const barcode = await generateInventoryBarcode(item.id);

      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, barcode } : row))
      );

      setSelected((current) => ({
        ...current,
        [item.id]: current[item.id] || 1,
      }));

      setWorkspace((current) =>
        current
          ? {
              ...current,
              summary: {
                ...current.summary,
                with_barcode: current.summary.with_barcode + 1,
                without_barcode: Math.max(
                  0,
                  current.summary.without_barcode - 1
                ),
              },
            }
          : current
      );

      setMessage(`${item.item_name}: ${barcode} generated.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Barcode could not be generated."
      );
    } finally {
      setBusyItemId("");
    }
  }

  function selectVisibleWithBarcodes() {
    const next = { ...selected };

    filteredItems.forEach((item) => {
      if (item.barcode) next[item.id] = next[item.id] || 1;
    });

    setSelected(next);
    setLabels([]);
  }

  function clearSelection() {
    setSelected({});
    setLabels([]);
  }

  async function prepareLabels() {
    const request = selectedEntries
      .filter(([, copies]) => copies > 0)
      .map(([inventoryItemId, copies]) => ({
        inventory_item_id: inventoryItemId,
        copies,
      }));

    if (request.length === 0) {
      setErrorMessage("Select at least one item with a barcode.");
      return;
    }

    try {
      setPreparing(true);
      setErrorMessage("");
      setMessage("");

      const result = await getInventoryBarcodeLabels(request);
      setLabels(result);

      const copies = result.reduce((sum, label) => sum + label.copies, 0);

      setMessage(
        `${copies} label(s) prepared at ${preset.width} × ${preset.height} mm.`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Labels could not be prepared."
      );
    } finally {
      setPreparing(false);
    }
  }

  if (!permissionsLoading && !can("inventory.view")) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={companyName}
          userName={userName}
          onLogout={logout}
        />

        <main className="p-6">
          <div className="rounded-xl border bg-card p-6">
            Inventory access is restricted.
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar companyName={companyName} userName={userName} onLogout={logout} />

      <style>{`
        @page {
          size: ${preset.width}mm ${preset.height}mm;
          margin: 0;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          #nexus-label-print,
          #nexus-label-print * {
            visibility: visible !important;
          }

          #nexus-label-print {
            position: absolute;
            inset: 0 auto auto 0;
            margin: 0 !important;
            padding: 0 !important;
          }

          .nexus-product-label {
            box-sizing: border-box;
            width: ${preset.width}mm !important;
            height: ${preset.height}mm !important;
            margin: 0 !important;
            border: 0 !important;
            break-after: page;
            page-break-after: always;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .nexus-product-label:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-wrap items-start justify-between gap-4 print:hidden">
          <div>
            <p className="text-sm font-medium text-primary">
              Inventory identity
            </p>

            <h1 className="mt-1 text-3xl font-bold">Barcode Labels</h1>

            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Generate Nexus barcodes and print product stickers at exact
              physical dimensions.
            </p>
          </div>

          <Link
            href="/inventory"
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
          >
            Back to Inventory
          </Link>
        </section>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive print:hidden">
            {errorMessage}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 print:hidden">
            {message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3 print:hidden">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Active items</p>
            <p className="mt-2 text-2xl font-bold">
              {workspace?.summary.active_items ?? items.length}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">With barcode</p>
            <p className="mt-2 text-2xl font-bold">
              {workspace?.summary.with_barcode ??
                items.filter((item) => item.barcode).length}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Without barcode</p>
            <p className="mt-2 text-2xl font-bold">
              {workspace?.summary.without_barcode ??
                items.filter((item) => !item.barcode).length}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-xl border bg-card p-5 print:hidden">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
            <label className="block">
              <span className="text-sm font-medium">Search items</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Item, SKU or barcode..."
                className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Sticker size</span>
              <select
                value={presetId}
                onChange={(event) => {
                  setPresetId(event.target.value);
                  setLabels([]);
                }}
                className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {presets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={selectVisibleWithBarcodes}
              >
                Select Visible
              </Button>

              <Button type="button" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Selected: <strong>{selectedCount}</strong> items ·{" "}
            <strong>{totalCopies}</strong> sticker copies
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border bg-card print:hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading barcode workspace...
            </div>
          ) : (
            <div className="divide-y">
              {filteredItems.map((item) => {
                const copies = selected[item.id] || 1;
                const checked = Boolean(selected[item.id]);

                return (
                  <div
                    key={item.id}
                    className="grid gap-3 p-4 md:grid-cols-[36px_1fr_160px_120px_110px] md:items-center"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!item.barcode}
                      onChange={() => toggleItem(item)}
                      className="h-4 w-4"
                    />

                    <div>
                      <p className="font-semibold">{item.item_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        SKU: {item.sku}
                      </p>
                      <p className="mt-1 text-xs font-medium">
                        {item.barcode || "No barcode assigned"}
                      </p>
                    </div>

                    <div className="font-semibold">
                      {money(Number(item.selling_price))}
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      Copies
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={checked ? copies : 1}
                        disabled={!checked}
                        onChange={(event) =>
                          setCopies(item.id, Number(event.target.value))
                        }
                        className="h-9 w-20 rounded-md border px-2"
                      />
                    </label>

                    <div>
                      {!item.barcode && can("inventory.update") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyItemId === item.id}
                          onClick={() => void generate(item)}
                        >
                          {busyItemId === item.id ? "Generating..." : "Generate"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No inventory items match the search.
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-6 flex flex-wrap gap-3 print:hidden">
          <Button
            type="button"
            disabled={preparing || selectedCount === 0}
            onClick={() => void prepareLabels()}
          >
            {preparing ? "Preparing..." : "Prepare Labels"}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={expandedLabels.length === 0}
            onClick={() => window.print()}
          >
            Print {expandedLabels.length} Label
            {expandedLabels.length === 1 ? "" : "s"}
          </Button>
        </section>

        {expandedLabels.length > 0 && (
          <section className="mt-8 print:mt-0">
            <div className="mb-3 print:hidden">
              <h2 className="text-lg font-semibold">Physical-size preview</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Each preview below is {preset.width} × {preset.height} mm.
                Keep printer scaling at 100% / Actual Size.
              </p>
            </div>

            <div
              id="nexus-label-print"
              className="flex flex-wrap gap-4 print:block"
            >
              {expandedLabels.map((label) => (
                <article
                  key={label.printKey}
                  className="nexus-product-label flex flex-col justify-between overflow-hidden border border-black bg-white p-[2mm] text-black"
                  style={{
                    width: `${preset.width}mm`,
                    height: `${preset.height}mm`,
                  }}
                >
                  <div className="min-h-0">
                    <div className="flex items-start justify-between gap-[1.5mm]">
                      <p className="max-h-[8mm] overflow-hidden text-[7pt] font-black leading-[1.12]">
                        {label.item_name}
                      </p>

                      <p className="shrink-0 text-[8pt] font-black">
                        {money(Number(label.selling_price))}
                      </p>
                    </div>

                    <p className="mt-[0.8mm] truncate text-[5.8pt] text-gray-600">
                      SKU: {label.sku}
                    </p>
                  </div>

                  <div className="h-[12mm] w-full">
                    <Code128Barcode
                      value={label.barcode}
                      height={38}
                      showText
                    />
                  </div>

                  <p className="text-center text-[5.2pt] font-semibold tracking-[0.08em]">
                    {companyName} · JINLAB NEXUS
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </DashboardLayout>
  );
}
