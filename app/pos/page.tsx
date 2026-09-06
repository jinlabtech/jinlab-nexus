"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Barcode,
  Banknote,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import TillSessionPanel from "@/components/pos/TillSessionPanel";
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


type PosBranch = {
  id: string;
  name: string;
};


type PosProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;

  selling_price: number;
  quantity: number;

  average_unit_cost: number;
  low_stock: boolean;
};


type PosCustomer = {
  id: string;
  name: string;
  number: string;
  phone: string | null;
};


type PosFinance = {
  currency: string;
  vat_rate: number;
  vat_registered: boolean;
  prices_include_vat: boolean;
};


type PosProfile = {
  enabled: boolean;

  key: string;
  name: string;
  display_name: string;

  allow_walk_in_customer: boolean;
  require_customer: boolean;
  require_cashier_session: boolean;

  max_cashier_discount_pct: number;
  supervisor_discount_threshold_pct: number;

  capabilities: Record<string, boolean>;

  receipt_options: Record<string, unknown>;
};


type PosWorkspace = {
  ok: boolean;

  profile: PosProfile;

  selected_branch_id:
    string |
    null;

  branches: PosBranch[];
  products: PosProduct[];
  customers: PosCustomer[];

  finance:
    PosFinance |
    null;

  permissions: {
    can_sell: boolean;
    can_discount: boolean;
  };
};


type CartItem = PosProduct & {
  cart_quantity: number;
  discount_percent: number;
};


type CheckoutResult = {
  ok: boolean;

  pos_sale_id: string;
  sale_number: string;

  invoice_id: string;
  invoice_number: string;

  payment_id: string;

  total: number;
  amount_tendered: number;
  change_due: number;

  payment_method: string;
  message: string;
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


export default function PosPage() {

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
      "pos.view"
    );


  const canSell =
    can(
      "pos.sell"
    );


  const canDiscount =
    can(
      "pos.discount"
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
      PosWorkspace |
      null
    >(null);


  const [
    selectedBranchId,
    setSelectedBranchId,
  ] =
    useState("");


  const [
    selectedCustomerId,
    setSelectedCustomerId,
  ] =
    useState("");


  const [
    cart,
    setCart,
  ] =
    useState<CartItem[]>(
      []
    );


  const [
    search,
    setSearch,
  ] =
    useState("");


  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<
      "cash" |
      "card" |
      "eft" |
      "other"
    >(
      "cash"
    );


  const [
    amountTendered,
    setAmountTendered,
  ] =
    useState("");


  const [
    paymentReference,
    setPaymentReference,
  ] =
    useState("");


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
    checkingOut,
    setCheckingOut,
  ] =
    useState(false);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  const [
    success,
    setSuccess,
  ] =
    useState<
      CheckoutResult |
      null
    >(null);


  async function loadWorkspace(
    branchId:
      string |
      null = null,

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
        posResult,
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
            "get_pos_workspace",
            {
              p_branch_id:
                branchId,
            }
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        posResult.error
      ) {
        throw posResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      const next =
        posResult.data as PosWorkspace;


      setWorkspace(
        next
      );


      if (
        !branchId &&
        next.branches.length >
          0
      ) {

        const firstBranch =
          next.branches[0].id;


        setSelectedBranchId(
          firstBranch
        );


        const {
          data:
            branchData,
          error:
            branchError,
        } =
          await supabase.rpc(
            "get_pos_workspace",
            {
              p_branch_id:
                firstBranch,
            }
          );


        if (branchError) {
          throw branchError;
        }


        setWorkspace(
          branchData as PosWorkspace
        );

      } else if (branchId) {

        setSelectedBranchId(
          branchId
        );
      }

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "POS could not be loaded."
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


      void loadWorkspace();

    },
    [
      permissionsLoading,
      canView,
    ]
  );


  async function changeBranch(
    branchId: string
  ) {

    if (
      cart.length >
      0
    ) {

      const approved =
        window.confirm(
          "Changing branch will clear the current POS cart. Continue?"
        );


      if (!approved) {
        return;
      }
    }


    setCart([]);
    setSuccess(null);

    setSelectedBranchId(
      branchId
    );


    await loadWorkspace(
      branchId,
      true
    );
  }


  const filteredProducts =
    useMemo(
      () => {

        const query =
          search
            .trim()
            .toLowerCase();


        if (!query) {
          return workspace
            ?.products ??
            [];
        }


        return (
          workspace
            ?.products.filter(
              (
                product
              ) => {

                return (
                  product.name
                    .toLowerCase()
                    .includes(query) ||

                  product.sku
                    .toLowerCase()
                    .includes(query) ||

                  (
                    product.barcode ??
                    ""
                  )
                    .toLowerCase()
                    .includes(query)
                );
              }
            ) ??
          []
        );

      },
      [
        workspace,
        search,
      ]
    );


  function addProduct(
    product:
      PosProduct
  ) {

    setSuccess(null);
    setErrorMessage("");


    setCart(
      (
        current
      ) => {

        const existing =
          current.find(
            (
              item
            ) =>
              item.id ===
              product.id
          );


        if (existing) {

          if (
            existing.cart_quantity >=
            product.quantity
          ) {

            setErrorMessage(
              `Only ${product.quantity} unit(s) of ${product.name} are available at this branch.`
            );

            return current;
          }


          return current.map(
            (
              item
            ) =>
              item.id ===
              product.id
                ? {
                    ...item,
                    cart_quantity:
                      item.cart_quantity +
                      1,
                  }
                : item
          );
        }


        return [
          ...current,
          {
            ...product,
            cart_quantity: 1,
            discount_percent: 0,
          },
        ];
      }
    );
  }


  function changeQuantity(
    productId: string,
    difference: number
  ) {

    setCart(
      (
        current
      ) =>
        current
          .map(
            (
              item
            ) => {

              if (
                item.id !==
                productId
              ) {
                return item;
              }


              const nextQuantity =
                item.cart_quantity +
                difference;


              if (
                nextQuantity >
                item.quantity
              ) {

                setErrorMessage(
                  `Only ${item.quantity} unit(s) of ${item.name} are available.`
                );

                return item;
              }


              return {
                ...item,
                cart_quantity:
                  nextQuantity,
              };
            }
          )
          .filter(
            (
              item
            ) =>
              item.cart_quantity >
              0
          )
    );
  }


  function removeItem(
    productId: string
  ) {

    setCart(
      (
        current
      ) =>
        current.filter(
          (
            item
          ) =>
            item.id !==
            productId
        )
    );
  }


  function setDiscount(
    productId: string,
    value: number
  ) {

    const safe =
      Math.max(
        0,
        Math.min(
          100,
          value
        )
      );


    setCart(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            productId
              ? {
                  ...item,
                  discount_percent:
                    safe,
                }
              : item
        )
    );
  }


  function lineTotal(
    item: CartItem
  ) {

    const base =
      item.selling_price *
      item.cart_quantity;


    const afterDiscount =
      base *
      (
        1 -
        item.discount_percent /
          100
      );


    const finance =
      workspace?.finance;


    if (
      finance?.vat_registered &&
      !finance.prices_include_vat
    ) {

      return (
        afterDiscount *
        (
          1 +
          finance.vat_rate /
            100
        )
      );
    }


    return afterDiscount;
  }


  const cartTotal =
    useMemo(
      () =>
        cart.reduce(
          (
            total,
            item
          ) =>
            total +
            lineTotal(item),
          0
        ),
      [
        cart,
        workspace,
      ]
    );


  const tendered =
    paymentMethod ===
    "cash"
      ? Number(
          amountTendered ||
          0
        )
      : cartTotal;


  const changeDue =
    paymentMethod ===
      "cash" &&
    tendered >
      cartTotal
      ? tendered -
        cartTotal
      : 0;


  function handleSearchEnter() {

    const query =
      search
        .trim()
        .toLowerCase();


    if (!query) {
      return;
    }


    const exact =
      workspace
        ?.products.find(
          (
            product
          ) =>
            product.sku
              .toLowerCase() ===
              query ||

            (
              product.barcode ??
              ""
            )
              .toLowerCase() ===
              query
        );


    if (exact) {

      addProduct(
        exact
      );

      setSearch("");
    }
  }


  async function checkout() {

    if (
      workspace?.profile?.require_customer &&
      !selectedCustomerId
    ) {

      setErrorMessage(
        "This POS profile requires a named customer."
      );

      return;
    }


    if (!selectedBranchId) {

      setErrorMessage(
        "Select a branch."
      );

      return;
    }


    if (
      cart.length ===
      0
    ) {

      setErrorMessage(
        "Add at least one item to the POS cart."
      );

      return;
    }


    if (
      paymentMethod ===
        "cash" &&
      tendered <
        cartTotal
    ) {

      setErrorMessage(
        "Cash tendered is less than the sale total."
      );

      return;
    }


    const approved =
      window.confirm(
        [
          "Complete POS sale?",
          "",
          `Total: ${money(
            cartTotal
          )}`,
          `Payment: ${paymentMethod.toUpperCase()}`,
          paymentMethod ===
          "cash"
            ? `Cash: ${money(
                tendered
              )}`
            : "",
          changeDue >
          0
            ? `Change: ${money(
                changeDue
              )}`
            : "",
          "",
          "This will update the invoice, payment, stock, Cost of Sales and Accounting.",
        ]
          .filter(Boolean)
          .join("\n")
      );


    if (!approved) {
      return;
    }


    try {

      setCheckingOut(true);

      setErrorMessage("");
      setSuccess(null);


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "checkout_pos_sale",
          {
            p_branch_id:
              selectedBranchId,

            p_customer_id:
              selectedCustomerId ||
              null,

            p_items:
              cart.map(
                (
                  item
                ) => ({
                  inventory_item_id:
                    item.id,

                  quantity:
                    item.cart_quantity,

                  discount_mode:
                    "percentage",

                  discount_value:
                    item.discount_percent,
                })
              ),

            p_payment_method:
              paymentMethod,

            p_amount_tendered:
              paymentMethod ===
              "cash"
                ? tendered
                : cartTotal,

            p_reference:
              paymentReference.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      const result =
        data as CheckoutResult;


      setSuccess(
        result
      );


      setCart([]);

      setAmountTendered("");
      setPaymentReference("");
      setSelectedCustomerId("");


      await loadWorkspace(
        selectedBranchId,
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "POS sale could not be completed."
      );

    } finally {

      setCheckingOut(false);
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
          userName="Admin"
          onLogout={
            logout
          }
        />


        <main className="p-6">

          <p className="text-sm text-muted-foreground">
            Loading POS...
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
          userName="Admin"
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-5xl p-6">

          <div className="rounded-2xl border bg-card p-6">

            <h1 className="text-xl font-bold">
              POS Restricted
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have permission to use Point of Sale.
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
        userName="Admin"
        onLogout={
          logout
        }
      />


      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-sm font-semibold text-muted-foreground">
              Sales
            </p>


            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {
                workspace?.profile?.display_name ??
                "Point of Sale"
              }
            </h1>


            <p className="mt-2 text-sm text-muted-foreground">
              {
                workspace?.profile
                  ? `${workspace.profile.name} · Fast sales connected directly to stock and Accounting.`
                  : "Fast sales connected directly to stock and Accounting."
              }
            </p>

          </div>


          <Button
            variant="outline"
            disabled={
              refreshing
            }
            onClick={() =>
              void loadWorkspace(
                selectedBranchId ||
                null,
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


        {
          workspace?.profile &&
          !workspace.profile.enabled && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              POS is currently disabled in Settings.
              Open Settings → Point of Sale Setup to enable checkout.
            </div>
          )
        }


        {
          errorMessage && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {
                errorMessage
              }
            </div>
          )
        }


        {
          selectedBranchId && (
            <TillSessionPanel
              branchId={selectedBranchId}
              onSessionChange={() =>
                void loadWorkspace(
                  selectedBranchId,
                  true
                )
              }
            />
          )
        }


        {
          success && (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">

              <div className="flex flex-wrap items-center justify-between gap-4">

                <div>

                  <p className="font-bold">
                    Sale completed · {
                      success.sale_number
                    }
                  </p>


                  <p className="mt-1 text-sm">
                    Invoice {
                      success.invoice_number
                    } · {
                      money(
                        success.total
                      )
                    }
                  </p>


                  {
                    success.change_due >
                    0 && (
                      <p className="mt-2 text-lg font-bold">
                        Change: {
                          money(
                            success.change_due
                          )
                        }
                      </p>
                    )
                  }

                </div>


                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `/invoices/${success.invoice_id}`
                    )
                  }
                >
                  <ReceiptText className="mr-2 h-4 w-4" />

                  Open Receipt / Invoice
                </Button>

              </div>

            </div>
          )
        }


        <div className="grid gap-6 xl:grid-cols-[1fr_430px]">

          <section>

            <div className="mb-5 grid gap-3 md:grid-cols-[220px_1fr]">

              <select
                value={
                  selectedBranchId
                }
                onChange={
                  (
                    event
                  ) =>
                    void changeBranch(
                      event.target.value
                    )
                }
                className="rounded-xl border bg-background px-4 py-3 text-sm font-semibold"
              >

                {
                  workspace
                    ?.branches.map(
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


              <div className="relative">

                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />


                <input
                  autoFocus
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
                        handleSearchEnter();
                      }
                    }
                  }
                  placeholder="Search product, SKU or scan barcode..."
                  className="w-full rounded-xl border bg-background py-3 pl-12 pr-4"
                />

                <Barcode className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />

              </div>

            </div>


            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">

              {
                filteredProducts.map(
                  (
                    product
                  ) => (
                    <button
                      key={
                        product.id
                      }
                      type="button"
                      onClick={() =>
                        addProduct(
                          product
                        )
                      }
                      className="group rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-md"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                          <ShoppingCart className="h-5 w-5" />
                        </div>


                        <span
                          className={
                            product.low_stock
                              ? "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
                              : "rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold"
                          }
                        >
                          {
                            product.quantity
                          } in stock
                        </span>

                      </div>


                      <h3 className="mt-5 font-bold">
                        {
                          product.name
                        }
                      </h3>


                      <p className="mt-1 text-xs text-muted-foreground">
                        {
                          product.sku
                        }
                      </p>


                      <p className="mt-5 text-xl font-bold">
                        {
                          money(
                            product.selling_price
                          )
                        }
                      </p>

                    </button>
                  )
                )
              }

            </div>


            {
              filteredProducts.length ===
                0 && (
                <div className="rounded-2xl border border-dashed p-10 text-center">

                  <p className="font-semibold">
                    No products found
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Try another product name, SKU or barcode.
                  </p>

                </div>
              )
            }

          </section>


          <aside className="h-fit rounded-2xl border bg-card shadow-sm xl:sticky xl:top-4">

            <div className="border-b p-5">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current Sale
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    Cart
                  </h2>

                </div>


                <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                  {
                    cart.reduce(
                      (
                        total,
                        item
                      ) =>
                        total +
                        item.cart_quantity,
                      0
                    )
                  } items
                </span>

              </div>

            </div>


            {
              cart.length ===
                0 ? (
                <div className="p-10 text-center">

                  <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground" />

                  <p className="mt-3 font-semibold">
                    Cart is empty
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Tap a product to begin.
                  </p>

                </div>
              ) : (
                <div className="max-h-[430px] divide-y overflow-y-auto">

                  {
                    cart.map(
                      (
                        item
                      ) => (
                        <div
                          key={
                            item.id
                          }
                          className="p-4"
                        >

                          <div className="flex items-start justify-between gap-3">

                            <div>

                              <p className="font-semibold">
                                {
                                  item.name
                                }
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {
                                  money(
                                    item.selling_price
                                  )
                                } each
                              </p>

                            </div>


                            <button
                              type="button"
                              onClick={() =>
                                removeItem(
                                  item.id
                                )
                              }
                              className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>

                          </div>


                          <div className="mt-4 flex items-center justify-between gap-3">

                            <div className="flex items-center rounded-lg border">

                              <button
                                type="button"
                                onClick={() =>
                                  changeQuantity(
                                    item.id,
                                    -1
                                  )
                                }
                                className="p-2"
                              >
                                <Minus className="h-4 w-4" />
                              </button>


                              <span className="min-w-10 text-center font-semibold">
                                {
                                  item.cart_quantity
                                }
                              </span>


                              <button
                                type="button"
                                onClick={() =>
                                  changeQuantity(
                                    item.id,
                                    1
                                  )
                                }
                                className="p-2"
                              >
                                <Plus className="h-4 w-4" />
                              </button>

                            </div>


                            <p className="font-bold">
                              {
                                money(
                                  lineTotal(
                                    item
                                  )
                                )
                              }
                            </p>

                          </div>


                          {
                            canDiscount &&
                            workspace?.profile?.capabilities?.discounts !== false && (
                              <label className="mt-3 flex items-center justify-between gap-3 text-xs">

                                <span className="text-muted-foreground">
                                  Discount %
                                </span>


                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={
                                    item.discount_percent
                                  }
                                  onChange={
                                    (
                                      event
                                    ) =>
                                      setDiscount(
                                        item.id,
                                        Number(
                                          event.target.value
                                        )
                                      )
                                  }
                                  className="w-20 rounded-md border bg-background px-2 py-1.5 text-right"
                                />

                              </label>
                            )
                          }

                        </div>
                      )
                    )
                  }

                </div>
              )
            }


            <div className="space-y-4 border-t p-5">

              <label className="block space-y-2 text-sm">

                <span className="font-medium">
                  Customer
                </span>


                <select
                  value={
                    selectedCustomerId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSelectedCustomerId(
                        event.target.value
                      )
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2.5"
                >

                  {
                    workspace?.profile?.allow_walk_in_customer &&
                    !workspace?.profile?.require_customer && (
                      <option value="">
                        Walk-in Customer
                      </option>
                    )
                  }


                  {
                    workspace
                      ?.customers
                      .filter(
                        (
                          customer
                        ) =>
                          customer.name
                            .toLowerCase() !==
                          "walk-in customer"
                      )
                      .map(
                        (
                          customer
                        ) => (
                          <option
                            key={
                              customer.id
                            }
                            value={
                              customer.id
                            }
                          >
                            {
                              customer.name
                            }
                          </option>
                        )
                      )
                  }

                </select>

              </label>


              <div className="grid grid-cols-4 gap-2">

                {
                  (
                    [
                      "cash",
                      "card",
                      "eft",
                      "other",
                    ] as const
                  ).map(
                    (
                      method
                    ) => (
                      <button
                        key={
                          method
                        }
                        type="button"
                        onClick={() =>
                          setPaymentMethod(
                            method
                          )
                        }
                        className={
                          paymentMethod ===
                          method
                            ? "rounded-lg bg-emerald-600 px-2 py-2.5 text-xs font-semibold uppercase text-white"
                            : "rounded-lg border px-2 py-2.5 text-xs font-semibold uppercase hover:bg-muted"
                        }
                      >
                        {
                          method
                        }
                      </button>
                    )
                  )
                }

              </div>


              {
                paymentMethod ===
                  "cash" && (
                  <label className="block space-y-2 text-sm">

                    <span className="font-medium">
                      Cash Tendered
                    </span>


                    <div className="relative">

                      <Banknote className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />


                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          amountTendered
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setAmountTendered(
                              event.target.value
                            )
                        }
                        className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-3"
                        placeholder={
                          money(
                            cartTotal
                          )
                        }
                      />

                    </div>

                  </label>
                )
              }


              {
                paymentMethod !==
                  "cash" && (
                  <label className="block space-y-2 text-sm">

                    <span className="font-medium">
                      Payment Reference
                    </span>


                    <div className="relative">

                      <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />


                      <input
                        value={
                          paymentReference
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPaymentReference(
                              event.target.value
                            )
                        }
                        className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-3"
                        placeholder="Optional reference"
                      />

                    </div>

                  </label>
                )
              }


              <div className="space-y-2 border-t pt-4">

                <div className="flex justify-between text-sm text-muted-foreground">

                  <span>
                    Total
                  </span>

                  <span>
                    {
                      money(
                        cartTotal
                      )
                    }
                  </span>

                </div>


                {
                  paymentMethod ===
                    "cash" &&
                  changeDue >
                    0 && (
                    <div className="flex justify-between text-sm font-semibold text-emerald-700">

                      <span>
                        Change
                      </span>

                      <span>
                        {
                          money(
                            changeDue
                          )
                        }
                      </span>

                    </div>
                  )
                }


                <div className="flex justify-between pt-2 text-xl font-bold">

                  <span>
                    Pay
                  </span>

                  <span>
                    {
                      money(
                        cartTotal
                      )
                    }
                  </span>

                </div>

              </div>


              <Button
                type="button"
                disabled={
                  !canSell ||
                  workspace?.profile?.enabled === false ||
                  checkingOut ||
                  cart.length ===
                    0
                }
                onClick={() =>
                  void checkout()
                }
                className="h-12 w-full bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
              >

                {
                  checkingOut
                    ? "Processing Sale..."
                    : "Complete Sale"
                }

              </Button>


              <p className="text-center text-[11px] leading-5 text-muted-foreground">
                Completing a sale automatically updates the invoice,
                payment, branch stock, Cost of Sales and Accounting.
              </p>

            </div>

          </aside>

        </div>

      </main>

    </DashboardLayout>
  );
}
