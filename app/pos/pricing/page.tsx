"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  BadgePercent,
  BookOpen,
  Plus,
  RefreshCw,
  Save,
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
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";


type Option = {
  id: string;
  name: string;
};


type Product = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  selling_price: number;
};


type PriceBookItem = {
  id?: string;

  inventory_item_id: string;
  product_name?: string;

  minimum_quantity: number;
  unit_price: number;
};


type PriceBook = {
  id: string;

  name: string;
  description: string | null;

  branch_id: string | null;
  branch_name: string | null;

  customer_type: string | null;

  starts_at: string | null;
  ends_at: string | null;

  priority: number;
  enabled: boolean;

  items: PriceBookItem[];
};


type Promotion = {
  id: string;

  name: string;
  description: string | null;

  branch_id: string | null;
  branch_name: string | null;

  customer_type: string | null;

  inventory_item_id: string | null;
  product_name: string | null;

  category_id: string | null;
  category_name: string | null;

  promotion_type:
    "percentage" |
    "fixed_price";

  promotion_value: number;

  minimum_quantity: number;

  starts_at: string | null;
  ends_at: string | null;

  priority: number;
  enabled: boolean;
};


type Workspace = {
  ok: boolean;

  can_manage: boolean;

  branches: Option[];
  categories: Option[];
  products: Product[];

  customer_types: string[];

  price_books: PriceBook[];
  promotions: Promotion[];
};


type PriceBookDraft = {
  id: string | null;

  name: string;
  description: string;

  branch_id: string;
  customer_type: string;

  starts_at: string;
  ends_at: string;

  priority: string;
  enabled: boolean;

  items: Array<{
    inventory_item_id: string;
    minimum_quantity: string;
    unit_price: string;
  }>;
};


type PromotionDraft = {
  id: string | null;

  name: string;
  description: string;

  branch_id: string;
  customer_type: string;

  target_type:
    "all" |
    "product" |
    "category";

  target_id: string;

  promotion_type:
    "percentage" |
    "fixed_price";

  promotion_value: string;

  minimum_quantity: string;

  starts_at: string;
  ends_at: string;

  priority: string;
  enabled: boolean;
};


function money(
  value:
    number |
    string |
    null |
    undefined
) {

  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}


function toLocalInput(
  value:
    string |
    null
) {

  if (!value) {
    return "";
  }


  const date =
    new Date(
      value
    );


  const local =
    new Date(
      date.getTime() -
      date.getTimezoneOffset() *
        60000
    );


  return local
    .toISOString()
    .slice(
      0,
      16
    );
}


function toIso(
  value: string
) {

  if (!value) {
    return null;
  }


  return new Date(
    value
  ).toISOString();
}


function newPriceBook():
  PriceBookDraft {

  return {
    id: null,

    name: "",
    description: "",

    branch_id: "",
    customer_type: "",

    starts_at: "",
    ends_at: "",

    priority: "100",
    enabled: false,

    items: [
      {
        inventory_item_id:
          "",

        minimum_quantity:
          "1",

        unit_price:
          "",
      },
    ],
  };
}


function newPromotion():
  PromotionDraft {

  return {
    id: null,

    name: "",
    description: "",

    branch_id: "",
    customer_type: "",

    target_type:
      "product",

    target_id: "",

    promotion_type:
      "percentage",

    promotion_value:
      "",

    minimum_quantity:
      "1",

    starts_at: "",
    ends_at: "",

    priority: "100",
    enabled: false,
  };
}


export default function PosPricingPage() {

  const router =
    useRouter();


  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();


  const canView =
    can(
      "pos.pricing.view"
    );


  const canManage =
    can(
      "pos.pricing.manage"
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      Workspace |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const [
    message,
    setMessage,
  ] =
    useState("");


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  const [
    priceBook,
    setPriceBook,
  ] =
    useState<PriceBookDraft>(
      newPriceBook()
    );


  const [
    promotion,
    setPromotion,
  ] =
    useState<PromotionDraft>(
      newPromotion()
    );


  async function load(
    silent = false
  ) {

    try {

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }


      setErrorMessage("");


      const {
        data: {
          user,
        },
      } =
        await supabase.auth
          .getUser();


      if (!user) {

        router.replace(
          "/login"
        );

        return;
      }


      const {
        data:
          profile,
        error:
          profileError,
      } =
        await supabase
          .from(
            "user_profile"
          )
          .select(
            "company_id"
          )
          .eq(
            "user_id",
            user.id
          )
          .single();


      if (
        profileError ||
        !profile?.company_id
      ) {

        throw new Error(
          "Company profile could not be loaded."
        );
      }


      const [
        companyResult,
        pricingResult,
      ] =
        await Promise.all([
          supabase
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
            .single(),

          supabase.rpc(
            "get_pos_pricing_workspace"
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        pricingResult.error
      ) {
        throw pricingResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      setWorkspace(
        pricingResult.data as Workspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "POS pricing could not be loaded."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);
    }
  }


  useEffect(
    () => {

      if (
        permissionsLoading
      ) {
        return;
      }


      if (!canView) {

        setLoading(false);

        return;
      }


      void load();

    },
    [
      permissionsLoading,
      canView,
    ]
  );


  function editPriceBook(
    row: PriceBook
  ) {

    setPriceBook({
      id:
        row.id,

      name:
        row.name,

      description:
        row.description ??
        "",

      branch_id:
        row.branch_id ??
        "",

      customer_type:
        row.customer_type ??
        "",

      starts_at:
        toLocalInput(
          row.starts_at
        ),

      ends_at:
        toLocalInput(
          row.ends_at
        ),

      priority:
        String(
          row.priority
        ),

      enabled:
        row.enabled,

      items:
        row.items.map(
          (
            item
          ) => ({
            inventory_item_id:
              item.inventory_item_id,

            minimum_quantity:
              String(
                item.minimum_quantity
              ),

            unit_price:
              String(
                item.unit_price
              ),
          })
        ),
    });


    window.scrollTo({
      top: 0,
      behavior:
        "smooth",
    });
  }


  function editPromotion(
    row: Promotion
  ) {

    const targetType:
      PromotionDraft["target_type"] =
        row.inventory_item_id
          ? "product"
          : row.category_id
            ? "category"
            : "all";


    setPromotion({
      id:
        row.id,

      name:
        row.name,

      description:
        row.description ??
        "",

      branch_id:
        row.branch_id ??
        "",

      customer_type:
        row.customer_type ??
        "",

      target_type:
        targetType,

      target_id:
        row.inventory_item_id ??
        row.category_id ??
        "",

      promotion_type:
        row.promotion_type,

      promotion_value:
        String(
          row.promotion_value
        ),

      minimum_quantity:
        String(
          row.minimum_quantity
        ),

      starts_at:
        toLocalInput(
          row.starts_at
        ),

      ends_at:
        toLocalInput(
          row.ends_at
        ),

      priority:
        String(
          row.priority
        ),

      enabled:
        row.enabled,
    });


    window.scrollTo({
      top: 0,
      behavior:
        "smooth",
    });
  }


  function updatePriceBookItem(
    index: number,
    patch:
      Partial<
        PriceBookDraft["items"][number]
      >
  ) {

    setPriceBook(
      (
        current
      ) => ({
        ...current,

        items:
          current.items.map(
            (
              row,
              rowIndex
            ) =>
              rowIndex ===
                index
                ? {
                    ...row,
                    ...patch,
                  }
                : row
          ),
      })
    );
  }


  function addPriceBookItem() {

    setPriceBook(
      (
        current
      ) => ({
        ...current,

        items: [
          ...current.items,

          {
            inventory_item_id:
              "",

            minimum_quantity:
              "1",

            unit_price:
              "",
          },
        ],
      })
    );
  }


  function removePriceBookItem(
    index: number
  ) {

    setPriceBook(
      (
        current
      ) => ({
        ...current,

        items:
          current.items.length <=
            1
            ? current.items
            : current.items.filter(
                (
                  _row,
                  rowIndex
                ) =>
                  rowIndex !==
                  index
              ),
      })
    );
  }


  async function savePriceBook() {

    if (
      priceBook.name.trim()
        .length <
      2
    ) {

      setErrorMessage(
        "Enter a price book name."
      );

      return;
    }


    const items =
      priceBook.items.map(
        (
          item
        ) => ({
          inventory_item_id:
            item.inventory_item_id,

          minimum_quantity:
            Number(
              item.minimum_quantity
            ),

          unit_price:
            Number(
              item.unit_price
            ),
        })
      );


    if (
      items.some(
        (
          item
        ) =>
          !item.inventory_item_id ||
          item.minimum_quantity <
            1 ||
          item.unit_price <=
            0
      )
    ) {

      setErrorMessage(
        "Complete every price book item."
      );

      return;
    }


    try {

      setSaving(true);
      setMessage("");
      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "save_pos_price_book",
          {
            p_price_book_id:
              priceBook.id,

            p_name:
              priceBook.name.trim(),

            p_description:
              priceBook.description.trim() ||
              null,

            p_branch_id:
              priceBook.branch_id ||
              null,

            p_customer_type:
              priceBook.customer_type ||
              null,

            p_starts_at:
              toIso(
                priceBook.starts_at
              ),

            p_ends_at:
              toIso(
                priceBook.ends_at
              ),

            p_priority:
              Number(
                priceBook.priority
              ),

            p_enabled:
              priceBook.enabled,

            p_items:
              items,
          }
        );


      if (error) {
        throw error;
      }


      setMessage(
        data?.message ??
        "Price book saved."
      );


      setPriceBook(
        newPriceBook()
      );


      await load(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Price book could not be saved."
      );

    } finally {

      setSaving(false);
    }
  }


  async function savePromotion() {

    if (
      promotion.name.trim()
        .length <
      2
    ) {

      setErrorMessage(
        "Enter a promotion name."
      );

      return;
    }


    const value =
      Number(
        promotion.promotion_value
      );


    if (
      value <=
      0
    ) {

      setErrorMessage(
        "Enter a valid promotional value."
      );

      return;
    }


    if (
      promotion.target_type !==
        "all" &&
      !promotion.target_id
    ) {

      setErrorMessage(
        "Choose the product or category for this promotion."
      );

      return;
    }


    try {

      setSaving(true);
      setMessage("");
      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "save_pos_promotion",
          {
            p_promotion_id:
              promotion.id,

            p_name:
              promotion.name.trim(),

            p_description:
              promotion.description.trim() ||
              null,

            p_branch_id:
              promotion.branch_id ||
              null,

            p_customer_type:
              promotion.customer_type ||
              null,

            p_inventory_item_id:
              promotion.target_type ===
                "product"
                ? promotion.target_id ||
                  null
                : null,

            p_category_id:
              promotion.target_type ===
                "category"
                ? promotion.target_id ||
                  null
                : null,

            p_promotion_type:
              promotion.promotion_type,

            p_promotion_value:
              value,

            p_minimum_quantity:
              Number(
                promotion.minimum_quantity
              ),

            p_starts_at:
              toIso(
                promotion.starts_at
              ),

            p_ends_at:
              toIso(
                promotion.ends_at
              ),

            p_priority:
              Number(
                promotion.priority
              ),

            p_enabled:
              promotion.enabled,
          }
        );


      if (error) {
        throw error;
      }


      setMessage(
        data?.message ??
        "Promotion saved."
      );


      setPromotion(
        newPromotion()
      );


      await load(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Promotion could not be saved."
      );

    } finally {

      setSaving(false);
    }
  }


  async function logout() {

    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  if (
    permissionsLoading ||
    loading
  ) {

    return (
      <DashboardLayout>

        <Navbar
          companyName={
            companyName
          }
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-7xl p-6">

          <p className="text-sm text-muted-foreground">
            Loading Pricing & Promotions...
          </p>

        </main>

      </DashboardLayout>
    );
  }


  if (!canView) {

    return (
      <DashboardLayout>

        <Navbar
          companyName={
            companyName
          }
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-5xl p-6">

          <div className="rounded-2xl border bg-card p-6">

            <h1 className="text-xl font-bold">
              POS Pricing Restricted
            </h1>


            <p className="mt-2 text-sm text-muted-foreground">
              Your role cannot access POS pricing controls.
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
        onLogout={
          logout
        }
      />


      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">

          <div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/pos"
                )
              }
              className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <ArrowLeft className="h-4 w-4" />

              Point of Sale
            </button>


            <p className="text-sm font-medium text-muted-foreground">
              POS Control
            </p>


            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Pricing & Promotions
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Control customer pricing centrally.
              Cashiers never type promotional prices themselves.
            </p>

          </div>


          <Button
            type="button"
            variant="outline"
            disabled={
              refreshing
            }
            onClick={() =>
              void load(
                true
              )
            }
          >

            <RefreshCw
              className={`mr-2 h-4 w-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh

          </Button>

        </div>


        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/10 p-5 text-sm leading-6">

          <strong className="text-primary">
            Pricing order:
          </strong>{" "}

          Catalogue price → Price Book → Promotion → approved manual discount/override.

          Promotions do not stack with other promotions.

        </div>


        {
          message && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
              {
                message
              }
            </div>
          )
        }


        {
          errorMessage && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {
                errorMessage
              }
            </div>
          )
        }


        {
          canManage && (
            <div className="mb-10 grid gap-6 xl:grid-cols-2">

              <section className="rounded-2xl border bg-card">

                <div className="border-b p-5">

                  <div className="flex items-center gap-3">

                    <BookOpen className="h-5 w-5 text-primary" />

                    <div>

                      <h2 className="font-bold">
                        Price Book
                      </h2>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Permanent or scheduled prices for branches, customer types or quantity bands.
                      </p>

                    </div>

                  </div>

                </div>


                <div className="space-y-4 p-5">

                  <input
                    value={
                      priceBook.name
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPriceBook(
                          {
                            ...priceBook,
                            name:
                              event.target.value,
                          }
                        )
                    }
                    placeholder="Price book name"
                    className="w-full rounded-xl border bg-background px-3 py-2.5"
                  />


                  <textarea
                    value={
                      priceBook.description
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPriceBook(
                          {
                            ...priceBook,
                            description:
                              event.target.value,
                          }
                        )
                    }
                    placeholder="Optional description"
                    rows={2}
                    className="w-full rounded-xl border bg-background px-3 py-2.5"
                  />


                  <div className="grid gap-3 md:grid-cols-2">

                    <select
                      value={
                        priceBook.branch_id
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPriceBook(
                            {
                              ...priceBook,
                              branch_id:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    >

                      <option value="">
                        All branches
                      </option>

                      {
                        workspace?.branches.map(
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


                    <select
                      value={
                        priceBook.customer_type
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPriceBook(
                            {
                              ...priceBook,
                              customer_type:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    >

                      <option value="">
                        All customer types
                      </option>

                      {
                        workspace?.customer_types.map(
                          (
                            type
                          ) => (
                            <option
                              key={
                                type
                              }
                              value={
                                type
                              }
                            >
                              {
                                type
                              }
                            </option>
                          )
                        )
                      }

                    </select>

                  </div>


                  <div className="grid gap-3 md:grid-cols-2">

                    <input
                      type="datetime-local"
                      value={
                        priceBook.starts_at
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPriceBook(
                            {
                              ...priceBook,
                              starts_at:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    />


                    <input
                      type="datetime-local"
                      value={
                        priceBook.ends_at
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPriceBook(
                            {
                              ...priceBook,
                              ends_at:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    />

                  </div>


                  <div className="rounded-xl border">

                    <div className="flex items-center justify-between border-b p-3">

                      <p className="text-sm font-semibold">
                        Products
                      </p>


                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={
                          addPriceBookItem
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />

                        Add
                      </Button>

                    </div>


                    <div className="space-y-3 p-3">

                      {
                        priceBook.items.map(
                          (
                            item,
                            index
                          ) => (
                            <div
                              key={
                                index
                              }
                              className="grid gap-2 md:grid-cols-[1fr_100px_130px_auto]"
                            >

                              <select
                                value={
                                  item.inventory_item_id
                                }
                                onChange={
                                  (
                                    event
                                  ) =>
                                    updatePriceBookItem(
                                      index,
                                      {
                                        inventory_item_id:
                                          event.target.value,
                                      }
                                    )
                                }
                                className="rounded-lg border bg-background px-3 py-2"
                              >

                                <option value="">
                                  Select product
                                </option>

                                {
                                  workspace?.products.map(
                                    (
                                      product
                                    ) => (
                                      <option
                                        key={
                                          product.id
                                        }
                                        value={
                                          product.id
                                        }
                                      >
                                        {
                                          product.name
                                        }
                                      </option>
                                    )
                                  )
                                }

                              </select>


                              <input
                                type="number"
                                min="1"
                                value={
                                  item.minimum_quantity
                                }
                                onChange={
                                  (
                                    event
                                  ) =>
                                    updatePriceBookItem(
                                      index,
                                      {
                                        minimum_quantity:
                                          event.target.value,
                                      }
                                    )
                                }
                                placeholder="Qty"
                                className="rounded-lg border bg-background px-3 py-2"
                              />


                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={
                                  item.unit_price
                                }
                                onChange={
                                  (
                                    event
                                  ) =>
                                    updatePriceBookItem(
                                      index,
                                      {
                                        unit_price:
                                          event.target.value,
                                      }
                                    )
                                }
                                placeholder="Unit price"
                                className="rounded-lg border bg-background px-3 py-2"
                              />


                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  removePriceBookItem(
                                    index
                                  )
                                }
                              >
                                ×
                              </Button>

                            </div>
                          )
                        )
                      }

                    </div>

                  </div>


                  <div className="grid gap-3 md:grid-cols-2">

                    <label className="text-sm">

                      <span className="text-muted-foreground">
                        Priority
                      </span>

                      <input
                        type="number"
                        value={
                          priceBook.priority
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPriceBook(
                              {
                                ...priceBook,
                                priority:
                                  event.target.value,
                              }
                            )
                        }
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                      />

                    </label>


                    <label className="flex items-center gap-3 rounded-xl border px-4 py-3">

                      <input
                        type="checkbox"
                        checked={
                          priceBook.enabled
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPriceBook(
                              {
                                ...priceBook,
                                enabled:
                                  event.target.checked,
                              }
                            )
                        }
                      />

                      <span className="text-sm font-semibold">
                        Enabled
                      </span>

                    </label>

                  </div>


                  <div className="flex gap-2">

                    <Button
                      type="button"
                      className="flex-1"
                      disabled={
                        saving
                      }
                      onClick={() =>
                        void savePriceBook()
                      }
                    >
                      <Save className="mr-2 h-4 w-4" />

                      Save Price Book
                    </Button>


                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setPriceBook(
                          newPriceBook()
                        )
                      }
                    >
                      Clear
                    </Button>

                  </div>

                </div>

              </section>


              <section className="rounded-2xl border bg-card">

                <div className="border-b p-5">

                  <div className="flex items-center gap-3">

                    <BadgePercent className="h-5 w-5 text-primary" />

                    <div>

                      <h2 className="font-bold">
                        Promotion
                      </h2>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Temporary automatic discounts without cashier intervention.
                      </p>

                    </div>

                  </div>

                </div>


                <div className="space-y-4 p-5">

                  <input
                    value={
                      promotion.name
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPromotion(
                          {
                            ...promotion,
                            name:
                              event.target.value,
                          }
                        )
                    }
                    placeholder="Promotion name"
                    className="w-full rounded-xl border bg-background px-3 py-2.5"
                  />


                  <textarea
                    value={
                      promotion.description
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPromotion(
                          {
                            ...promotion,
                            description:
                              event.target.value,
                          }
                        )
                    }
                    placeholder="Optional description"
                    rows={2}
                    className="w-full rounded-xl border bg-background px-3 py-2.5"
                  />


                  <div className="grid gap-3 md:grid-cols-2">

                    <select
                      value={
                        promotion.branch_id
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,
                              branch_id:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    >

                      <option value="">
                        All branches
                      </option>

                      {
                        workspace?.branches.map(
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


                    <select
                      value={
                        promotion.customer_type
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,
                              customer_type:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    >

                      <option value="">
                        All customer types
                      </option>

                      {
                        workspace?.customer_types.map(
                          (
                            type
                          ) => (
                            <option
                              key={
                                type
                              }
                              value={
                                type
                              }
                            >
                              {
                                type
                              }
                            </option>
                          )
                        )
                      }

                    </select>

                  </div>


                  <div className="grid gap-3 md:grid-cols-2">

                    <select
                      value={
                        promotion.target_type
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,

                              target_type:
                                event.target.value as
                                  PromotionDraft["target_type"],

                              target_id:
                                "",
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    >

                      <option value="all">
                        All products
                      </option>

                      <option value="product">
                        Specific product
                      </option>

                      <option value="category">
                        Product category
                      </option>

                    </select>


                    {
                      promotion.target_type ===
                        "product" ? (

                        <select
                          value={
                            promotion.target_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setPromotion(
                                {
                                  ...promotion,
                                  target_id:
                                    event.target.value,
                                }
                              )
                          }
                          className="rounded-xl border bg-background px-3 py-2.5"
                        >

                          <option value="">
                            Select product
                          </option>

                          {
                            workspace?.products.map(
                              (
                                product
                              ) => (
                                <option
                                  key={
                                    product.id
                                  }
                                  value={
                                    product.id
                                  }
                                >
                                  {
                                    product.name
                                  }
                                </option>
                              )
                            )
                          }

                        </select>

                      ) : promotion.target_type ===
                          "category" ? (

                        <select
                          value={
                            promotion.target_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setPromotion(
                                {
                                  ...promotion,
                                  target_id:
                                    event.target.value,
                                }
                              )
                          }
                          className="rounded-xl border bg-background px-3 py-2.5"
                        >

                          <option value="">
                            Select category
                          </option>

                          {
                            workspace?.categories.map(
                              (
                                category
                              ) => (
                                <option
                                  key={
                                    category.id
                                  }
                                  value={
                                    category.id
                                  }
                                >
                                  {
                                    category.name
                                  }
                                </option>
                              )
                            )
                          }

                        </select>

                      ) : (
                        <div className="rounded-xl border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                          Applies to all products
                        </div>
                      )
                    }

                  </div>


                  <div className="grid gap-3 md:grid-cols-2">

                    <select
                      value={
                        promotion.promotion_type
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,

                              promotion_type:
                                event.target.value as
                                  PromotionDraft["promotion_type"],
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    >

                      <option value="percentage">
                        Percentage discount
                      </option>

                      <option value="fixed_price">
                        Fixed promotional price
                      </option>

                    </select>


                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={
                        promotion.promotion_value
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,
                              promotion_value:
                                event.target.value,
                            }
                          )
                      }
                      placeholder={
                        promotion.promotion_type ===
                          "percentage"
                          ? "Discount %"
                          : "Promotional price"
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    />

                  </div>


                  <label className="text-sm">

                    <span className="text-muted-foreground">
                      Minimum quantity
                    </span>

                    <input
                      type="number"
                      min="1"
                      value={
                        promotion.minimum_quantity
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,
                              minimum_quantity:
                                event.target.value,
                            }
                          )
                      }
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                    />

                  </label>


                  <div className="grid gap-3 md:grid-cols-2">

                    <input
                      type="datetime-local"
                      value={
                        promotion.starts_at
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,
                              starts_at:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    />


                    <input
                      type="datetime-local"
                      value={
                        promotion.ends_at
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPromotion(
                            {
                              ...promotion,
                              ends_at:
                                event.target.value,
                            }
                          )
                      }
                      className="rounded-xl border bg-background px-3 py-2.5"
                    />

                  </div>


                  <div className="grid gap-3 md:grid-cols-2">

                    <label className="text-sm">

                      <span className="text-muted-foreground">
                        Priority
                      </span>

                      <input
                        type="number"
                        value={
                          promotion.priority
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPromotion(
                              {
                                ...promotion,
                                priority:
                                  event.target.value,
                              }
                            )
                        }
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                      />

                    </label>


                    <label className="flex items-center gap-3 rounded-xl border px-4 py-3">

                      <input
                        type="checkbox"
                        checked={
                          promotion.enabled
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPromotion(
                              {
                                ...promotion,
                                enabled:
                                  event.target.checked,
                              }
                            )
                        }
                      />

                      <span className="text-sm font-semibold">
                        Enabled
                      </span>

                    </label>

                  </div>


                  <div className="flex gap-2">

                    <Button
                      type="button"
                      className="flex-1"
                      disabled={
                        saving
                      }
                      onClick={() =>
                        void savePromotion()
                      }
                    >
                      <Save className="mr-2 h-4 w-4" />

                      Save Promotion
                    </Button>


                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setPromotion(
                          newPromotion()
                        )
                      }
                    >
                      Clear
                    </Button>

                  </div>

                </div>

              </section>

            </div>
          )
        }


        <div className="grid gap-8 xl:grid-cols-2">

          <section>

            <div className="mb-4">

              <h2 className="text-xl font-bold">
                Price Books
              </h2>


              <p className="mt-1 text-sm text-muted-foreground">
                {
                  workspace?.price_books.length ??
                  0
                } configured
              </p>

            </div>


            <div className="space-y-3">

              {
                workspace?.price_books.length ===
                  0 ? (

                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No price books configured yet.
                  </div>

                ) : (

                  workspace?.price_books.map(
                    (
                      row
                    ) => (
                      <div
                        key={
                          row.id
                        }
                        className="rounded-2xl border bg-card p-5"
                      >

                        <div className="flex items-start justify-between gap-4">

                          <div>

                            <p className="font-bold">
                              {
                                row.name
                              }
                            </p>


                            <p className="mt-1 text-xs text-muted-foreground">
                              {
                                row.branch_name ??
                                "All branches"
                              } · {
                                row.customer_type ??
                                "All customers"
                              }
                            </p>

                          </div>


                          <span className={
                            row.enabled
                              ? "rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary"
                              : "rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground"
                          }>
                            {
                              row.enabled
                                ? "Enabled"
                                : "Disabled"
                            }
                          </span>

                        </div>


                        <div className="mt-4 space-y-2">

                          {
                            row.items.map(
                              (
                                item
                              ) => (
                                <div
                                  key={
                                    item.id
                                  }
                                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                                >

                                  <span>
                                    {
                                      item.product_name
                                    } · Qty {
                                      item.minimum_quantity
                                    }+
                                  </span>


                                  <strong>
                                    {
                                      money(
                                        item.unit_price
                                      )
                                    }
                                  </strong>

                                </div>
                              )
                            )
                          }

                        </div>


                        {
                          canManage && (
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-4"
                              onClick={() =>
                                editPriceBook(
                                  row
                                )
                              }
                            >
                              Edit
                            </Button>
                          )
                        }

                      </div>
                    )
                  )
                )
              }

            </div>

          </section>


          <section>

            <div className="mb-4">

              <h2 className="text-xl font-bold">
                Promotions
              </h2>


              <p className="mt-1 text-sm text-muted-foreground">
                {
                  workspace?.promotions.length ??
                  0
                } configured
              </p>

            </div>


            <div className="space-y-3">

              {
                workspace?.promotions.length ===
                  0 ? (

                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No promotions configured yet.
                  </div>

                ) : (

                  workspace?.promotions.map(
                    (
                      row
                    ) => (
                      <div
                        key={
                          row.id
                        }
                        className="rounded-2xl border bg-card p-5"
                      >

                        <div className="flex items-start justify-between gap-4">

                          <div>

                            <p className="font-bold">
                              {
                                row.name
                              }
                            </p>


                            <p className="mt-1 text-xs text-muted-foreground">
                              {
                                row.product_name ??
                                row.category_name ??
                                "All products"
                              } · {
                                row.branch_name ??
                                "All branches"
                              }
                            </p>

                          </div>


                          <span className={
                            row.enabled
                              ? "rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary"
                              : "rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground"
                          }>
                            {
                              row.enabled
                                ? "Enabled"
                                : "Disabled"
                            }
                          </span>

                        </div>


                        <p className="mt-4 text-xl font-bold">

                          {
                            row.promotion_type ===
                              "percentage"
                              ? `${Number(
                                  row.promotion_value
                                )}% off`
                              : money(
                                  row.promotion_value
                                )
                          }

                        </p>


                        <p className="mt-1 text-xs text-muted-foreground">
                          Minimum quantity {
                            row.minimum_quantity
                          } · Priority {
                            row.priority
                          }
                        </p>


                        {
                          canManage && (
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-4"
                              onClick={() =>
                                editPromotion(
                                  row
                                )
                              }
                            >
                              Edit
                            </Button>
                          )
                        }

                      </div>
                    )
                  )
                )
              }

            </div>

          </section>

        </div>

      </main>

    </DashboardLayout>
  );
}
