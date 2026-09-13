"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Barcode,
  Printer,
  RefreshCw,
  Search,
  Smartphone,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type Branch = {
  id: string;
  name: string;
};


type BarcodeItem = {
  id: string;
  item_name: string;
  sku: string;

  barcode:
    string |
    null;

  selling_price: number;
  cost_price: number;
  minimum_stock: number;
  branch_quantity: number;
};


type Workspace = {
  ok: boolean;

  selected_branch_id:
    string |
    null;

  branches:
    Branch[];

  summary: {
    active_items: number;
    with_barcode: number;
    without_barcode: number;
  };
};


function money(
  value:
    number |
    string
) {

  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(
    Number(
      value
    )
  );
}


export default function InventoryBarcodesPage() {

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
    workspace,
    setWorkspace,
  ] =
    useState<Workspace | null>(
      null
    );


  const [
    items,
    setItems,
  ] =
    useState<BarcodeItem[]>(
      []
    );


  const [
    branchId,
    setBranchId,
  ] =
    useState(
      ""
    );


  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );


  const [
    selected,
    setSelected,
  ] =
    useState<
      Record<
        string,
        number
      >
    >(
      {}
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


  async function initialise() {

    setLoading(
      true
    );


    try {

      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();


      if (!user) {

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
        profile?.full_name
      ) {

        setUserName(
          profile.full_name
        );
      }


      if (
        profile?.company_id
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
          company?.company_name
        ) {

          setCompanyName(
            company.company_name
          );
        }

      }


      await loadWorkspace(
        ""
      );


      await loadItems(
        "",
        ""
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load barcode workspace."
      );

    } finally {

      setLoading(
        false
      );

    }

  }


  async function loadWorkspace(
    nextBranch:
      string
  ) {

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "get_inventory_barcode_workspace",
        {
          p_branch_id:
            nextBranch ||
            null,
        }
      );


    if (error) {
      throw error;
    }


    setWorkspace(
      data as Workspace
    );
  }


  async function loadItems(
    query =
      search,

    nextBranch =
      branchId
  ) {

    setLoading(
      true
    );

    setErrorMessage(
      ""
    );


    try {

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "search_inventory_barcodes",
          {
            p_search:
              query.trim() ||
              null,

            p_branch_id:
              nextBranch ||
              null,

            p_limit:
              100,
          }
        );


      if (error) {
        throw error;
      }


      setItems(
        (
          data ??
          []
        ) as BarcodeItem[]
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to search inventory."
      );

    } finally {

      setLoading(
        false
      );

    }

  }


  useEffect(
    () => {

      void initialise();

    },
    []
  );


  function toggleItem(
    itemId: string
  ) {

    setSelected(
      (
        current
      ) => {

        const next = {
          ...current,
        };


        if (
          next[
            itemId
          ]
        ) {

          delete next[
            itemId
          ];

        } else {

          next[
            itemId
          ] =
            1;

        }


        return next;
      }
    );
  }


  function changeCopies(
    itemId: string,
    value: number
  ) {

    setSelected(
      (
        current
      ) => ({
        ...current,

        [itemId]:
          Math.max(
            1,
            Math.min(
              999,
              Number.isFinite(
                value
              )
                ? value
                : 1
            )
          ),
      })
    );
  }


  async function generateBarcode(
    itemId: string
  ) {

    setErrorMessage(
      ""
    );


    const {
      error,
    } =
      await supabase.rpc(
        "generate_inventory_barcode",
        {
          p_inventory_item_id:
            itemId,
        }
      );


    if (error) {

      setErrorMessage(
        error.message
      );

      return;
    }


    await loadWorkspace(
      branchId
    );

    await loadItems();
  }


  async function generateSelected() {

    const selectedItems =
      items.filter(
        (
          item
        ) =>
          selected[
            item.id
          ] &&
          !item.barcode
      );


    for (
      const item
      of selectedItems
    ) {

      const {
        error,
      } =
        await supabase.rpc(
          "generate_inventory_barcode",
          {
            p_inventory_item_id:
              item.id,
          }
        );


      if (error) {

        setErrorMessage(
          error.message
        );

        return;
      }

    }


    await loadWorkspace(
      branchId
    );

    await loadItems();
  }


  async function editBarcode(
    item:
      BarcodeItem
  ) {

    const value =
      window.prompt(
        `Barcode for ${item.item_name}`,
        item.barcode ??
        ""
      );


    if (
      value ===
      null
    ) {
      return;
    }


    const {
      error,
    } =
      await supabase.rpc(
        "set_inventory_barcode",
        {
          p_inventory_item_id:
            item.id,

          p_barcode:
            value,
        }
      );


    if (error) {

      setErrorMessage(
        error.message
      );

      return;
    }


    await loadWorkspace(
      branchId
    );

    await loadItems();
  }


  function printLabels() {

    const payload =
      items

        .filter(
          (
            item
          ) =>
            selected[
              item.id
            ] &&
            item.barcode
        )

        .map(
          (
            item
          ) => ({
            inventory_item_id:
              item.id,

            copies:
              selected[
                item.id
              ],
          })
        );


    if (
      payload.length ===
      0
    ) {

      setErrorMessage(
        "Select at least one item with a barcode."
      );

      return;
    }


    const encoded =
      encodeURIComponent(
        JSON.stringify(
          payload
        )
      );


    window.open(
      `/inventory/barcodes/print?items=${encoded}`,
      "_blank"
    );
  }


  async function logout() {

    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }


  const selectedCount =
    Object.keys(
      selected
    ).length;


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

                <Barcode className="h-6 w-6" />

                <h1 className="text-2xl font-bold">
                  Barcodes & Labels
                </h1>

              </div>


              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Assign manufacturer barcodes,
                generate Nexus internal barcodes and
                print inventory labels.
              </p>

            </div>


            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  "/inventory/scan"
                )
              }
            >
              <Smartphone className="mr-2 h-4 w-4" />

              Open Scanner
            </Button>

          </div>


          <div className="mb-6 grid gap-4 sm:grid-cols-3">

            <div className="rounded-2xl border bg-background p-5">

              <p className="text-xs uppercase text-muted-foreground">
                Active items
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  workspace
                    ?.summary
                    .active_items ??
                  0
                }
              </p>

            </div>


            <div className="rounded-2xl border bg-background p-5">

              <p className="text-xs uppercase text-muted-foreground">
                With barcode
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  workspace
                    ?.summary
                    .with_barcode ??
                  0
                }
              </p>

            </div>


            <div className="rounded-2xl border bg-background p-5">

              <p className="text-xs uppercase text-muted-foreground">
                Missing barcode
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  workspace
                    ?.summary
                    .without_barcode ??
                  0
                }
              </p>

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


          <div className="mb-5 rounded-2xl border bg-background p-4">

            <div className="flex flex-wrap gap-3">

              <select
                value={
                  branchId
                }
                onChange={
                  (
                    event
                  ) => {

                    const value =
                      event.target.value;

                    setBranchId(
                      value
                    );

                    void loadWorkspace(
                      value
                    );

                    void loadItems(
                      search,
                      value
                    );
                  }
                }
                className="h-11 min-w-48 rounded-xl border bg-background px-3 text-sm"
              >
                <option value="">
                  All branches
                </option>


                {
                  workspace
                    ?.branches
                    .map(
                      (
                        branch
                      ) => (

                        <option
                          key={
                            branch.id
                          }
                          value={
                            branch.id
                          }
                        >
                          {
                            branch.name
                          }
                        </option>

                      )
                    )
                }

              </select>


              <div className="relative min-w-0 flex-1">

                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />


                <input
                  value={
                    search
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSearch(
                        event.target.value
                      )
                  }
                  onKeyDown={
                    (
                      event
                    ) => {

                      if (
                        event.key ===
                        "Enter"
                      ) {

                        void loadItems();
                      }
                    }
                  }
                  placeholder="Search item, SKU or barcode..."
                  className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm"
                />

              </div>


              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void loadItems()
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />

                Search
              </Button>

            </div>

          </div>


          <div className="mb-4 flex flex-wrap gap-3">

            <Button
              type="button"
              variant="outline"
              disabled={
                selectedCount ===
                0
              }
              onClick={() =>
                void generateSelected()
              }
            >
              <Barcode className="mr-2 h-4 w-4" />

              Generate Missing for Selected
            </Button>


            <Button
              type="button"
              disabled={
                selectedCount ===
                0
              }
              onClick={
                printLabels
              }
            >
              <Printer className="mr-2 h-4 w-4" />

              Print Labels
            </Button>

          </div>


          <div className="overflow-x-auto rounded-2xl border bg-background">

            <table className="w-full min-w-[950px] text-sm">

              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">

                <tr>

                  <th className="px-4 py-3">
                    Select
                  </th>

                  <th className="px-4 py-3">
                    Item
                  </th>

                  <th className="px-4 py-3">
                    SKU
                  </th>

                  <th className="px-4 py-3">
                    Barcode
                  </th>

                  <th className="px-4 py-3 text-right">
                    Stock
                  </th>

                  <th className="px-4 py-3 text-right">
                    Price
                  </th>

                  <th className="px-4 py-3">
                    Copies
                  </th>

                  <th className="px-4 py-3 text-right">
                    Actions
                  </th>

                </tr>

              </thead>


              <tbody className="divide-y">

                {
                  items.map(
                    (
                      item
                    ) => {

                      const checked =
                        Boolean(
                          selected[
                            item.id
                          ]
                        );


                      return (

                        <tr
                          key={
                            item.id
                          }
                        >

                          <td className="px-4 py-4">

                            <input
                              type="checkbox"
                              checked={
                                checked
                              }
                              onChange={() =>
                                toggleItem(
                                  item.id
                                )
                              }
                            />

                          </td>


                          <td className="px-4 py-4 font-semibold">
                            {
                              item.item_name
                            }
                          </td>


                          <td className="px-4 py-4">
                            {
                              item.sku
                            }
                          </td>


                          <td className="px-4 py-4">

                            {
                              item.barcode
                                ? (
                                  <span className="font-mono text-xs">
                                    {
                                      item.barcode
                                    }
                                  </span>
                                )
                                : (
                                  <span className="text-muted-foreground">
                                    Not assigned
                                  </span>
                                )
                            }

                          </td>


                          <td className="px-4 py-4 text-right font-semibold">
                            {
                              item.branch_quantity
                            }
                          </td>


                          <td className="px-4 py-4 text-right">
                            {
                              money(
                                item.selling_price
                              )
                            }
                          </td>


                          <td className="px-4 py-4">

                            <input
                              type="number"
                              min={1}
                              max={999}
                              disabled={
                                !checked
                              }
                              value={
                                selected[
                                  item.id
                                ] ??
                                1
                              }
                              onChange={
                                (
                                  event
                                ) =>
                                  changeCopies(
                                    item.id,
                                    Number(
                                      event.target.value
                                    )
                                  )
                              }
                              className="h-9 w-20 rounded-lg border bg-background px-2"
                            />

                          </td>


                          <td className="px-4 py-4">

                            <div className="flex justify-end gap-2">

                              {
                                !item.barcode && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      void generateBarcode(
                                        item.id
                                      )
                                    }
                                  >
                                    Generate
                                  </Button>
                                )
                              }


                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void editBarcode(
                                    item
                                  )
                                }
                              >
                                {
                                  item.barcode
                                    ? "Change"
                                    : "Assign"
                                }
                              </Button>

                            </div>

                          </td>

                        </tr>

                      );

                    }
                  )
                }

              </tbody>

            </table>


            {
              !loading &&
              items.length ===
              0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No matching inventory items.
                </div>
              )
            }

          </div>

        </div>

      </main>

    </DashboardLayout>
  );
}
