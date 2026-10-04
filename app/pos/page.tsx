"use client";

import Link from "next/link";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useEffect,
  useMemo,
  useRef,
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
import SplitTenderPanel, {
  type PosTenderDraft,
} from "@/components/pos/SplitTenderPanel";
import SuspendedSalesPanel, {
  type RecalledSuspendedSale,
} from "@/components/pos/SuspendedSalesPanel";
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

import {
  clearPosSessionDraft,
  readPosSessionDraft,
  savePosSessionDraft,
} from "@/lib/nexus/pos-session-draft";


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

  override_unit_price?:
    number |
    null;
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

  const [
    mobileCartOpen,
    setMobileCartOpen,
  ] = useState(false);



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


  const canRequestDiscountApproval =
    can(
      "pos.discount.request"
    );


  const canApproveDiscount =
    can(
      "pos.discount.approve"
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


  const productSearchRef =
    useRef<HTMLInputElement | null>(
      null
    );


  const [
    posDraftReady,
    setPosDraftReady,
  ] = useState(false);


  const restoredDraftRef =
    useRef(false);


  const draftBranchLoadRef =
    useRef<string | null>(
      null
    );


  function focusProductSearch() {

    window.requestAnimationFrame(
      () => {

        productSearchRef.current
          ?.focus({
            preventScroll: true,
          });

      }
    );

  }


  const [
    activeSuspendedSaleId,
    setActiveSuspendedSaleId,
  ] =
    useState<
      string |
      null
    >(null);


  const [
    activeSuspendedSaleNumber,
    setActiveSuspendedSaleNumber,
  ] =
    useState<
      string |
      null
    >(null);


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
    splitPaymentActive,
    setSplitPaymentActive,
  ] =
    useState(false);


  const [
    splitTenders,
    setSplitTenders,
  ] =
    useState<
      PosTenderDraft[]
    >([]);


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
    activeApprovalId,
    setActiveApprovalId,
  ] =
    useState<
      string |
      null
    >(null);


  const [
    activeApprovalStatus,
    setActiveApprovalStatus,
  ] =
    useState<
      "" |
      "pending" |
      "approved" |
      "rejected" |
      "expired"
    >("");


  const [
    requestingApproval,
    setRequestingApproval,
  ] =
    useState(false);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  useEffect(() => {

    if (
      !activeApprovalId ||
      !selectedBranchId ||
      activeApprovalStatus !==
        "pending"
    ) {
      return;
    }


    let active =
      true;


    async function pollApproval() {

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_pos_approval_workspace",
          {
            p_branch_id:
              selectedBranchId,
          }
        );


      if (
        !active ||
        error
      ) {
        return;
      }


      const request =
        (
          data?.my_requests ??
          []
        ).find(
          (
            row:
              {
                id: string;
                status: string;
              }
          ) =>
            row.id ===
            activeApprovalId
        );


      if (
        !request
      ) {
        return;
      }


      if (
        request.status ===
        "approved"
      ) {

        setActiveApprovalStatus(
          "approved"
        );

        setErrorMessage(
          ""
        );

        return;
      }


      if (
        request.status ===
          "rejected" ||
        request.status ===
          "expired"
      ) {

        setActiveApprovalStatus(
          request.status
        );

        setActiveApprovalId(
          null
        );

        setErrorMessage(
          request.status ===
            "rejected"
            ? "The owner rejected this discount request."
            : "The discount approval expired. Request approval again."
        );
      }
    }


    void pollApproval();


    const timer =
      window.setInterval(
        () => {
          void pollApproval();
        },
        4000
      );


    return () => {

      active =
        false;

      window.clearInterval(
        timer
      );
    };

  }, [
    activeApprovalId,
    activeApprovalStatus,
    selectedBranchId,
  ]);



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


  // Cart changes invalidate an approval because approvals
  // are bound to the exact item/quantity/discount snapshot.
  useEffect(
    () => {

      queueMicrotask(
        () => {

          setActiveApprovalId(
            null
          );

          setActiveApprovalStatus(
            ""
          );
        }
      );

    },
    [
      cart,
    ]
  );


  useEffect(
    () => {

      if (
        permissionsLoading
      ) {
        return;
      }


      if (!canView) {

        queueMicrotask(
          () => {
            setLoading(false);
          }
        );

        return;
      }


      queueMicrotask(
        () => {
          void loadWorkspace();
        }
      );

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

    setActiveSuspendedSaleId(
      null
    );

    setActiveSuspendedSaleNumber(
      null
    );

    setSelectedBranchId(
      branchId
    );


    await loadWorkspace(
      branchId,
      true
    );
  }


  /*
   * Restore unfinished POS basket only after
   * the current POS workspace is available.
   *
   * Products, prices and stock always come
   * from the freshly loaded workspace.
   */
  useEffect(
    () => {

      if (
        !workspace ||
        !selectedBranchId ||
        restoredDraftRef.current
      ) {
        return;
      }


      const draft =
        readPosSessionDraft();


      if (!draft) {

        restoredDraftRef.current =
          true;

        setPosDraftReady(
          true
        );

        return;
      }


      if (
        draft.branchId !==
        selectedBranchId
      ) {

        const branchExists =
          workspace.branches.some(
            (branch) =>
              branch.id ===
              draft.branchId
          );


        if (!branchExists) {

          clearPosSessionDraft();

          restoredDraftRef.current =
            true;

          setPosDraftReady(
            true
          );

          return;
        }


        if (
          draftBranchLoadRef.current ===
          draft.branchId
        ) {
          return;
        }


        draftBranchLoadRef.current =
          draft.branchId;


        queueMicrotask(
          () => {
            void loadWorkspace(
              draft.branchId,
              true
            );
          }
        );

        return;
      }


      const restoredCart:
        CartItem[] =
        draft.lines.flatMap(
          (line) => {

            const product =
              workspace.products.find(
                (item) =>
                  item.id ===
                  line.productId
              );


            if (
              !product ||
              product.quantity <= 0
            ) {
              return [];
            }


            const quantity =
              Math.min(
                product.quantity,
                Math.max(
                  1,
                  Math.floor(
                    Number(
                      line.quantity
                    ) || 1
                  )
                )
              );


            const discount =
              Math.min(
                100,
                Math.max(
                  0,
                  Number(
                    line.discountPercent
                  ) || 0
                )
              );


            const override =
              line.overrideUnitPrice !==
                null &&
              Number(
                line.overrideUnitPrice
              ) > 0
                ? Number(
                    line.overrideUnitPrice
                  )
                : null;


            return [
              {
                ...product,

                cart_quantity:
                  quantity,

                discount_percent:
                  discount,

                override_unit_price:
                  override,
              },
            ];
          }
        );


      setCart(
        restoredCart
      );


      const customerStillExists =
        draft.customerId
          ? workspace.customers.some(
              (customer) =>
                customer.id ===
                draft.customerId
            )
          : false;


      setSelectedCustomerId(
        customerStillExists
          ? draft.customerId ?? ""
          : ""
      );


      /*
       * Never restore an old approval.
       * Approval must be validated again.
       */
      setActiveApprovalId(
        null
      );

      setActiveApprovalStatus(
        ""
      );


      restoredDraftRef.current =
        true;

      setPosDraftReady(
        true
      );

    },
    [
      workspace,
      selectedBranchId,
    ]
  );


  /*
   * Save only transaction structure.
   * Payment details and approvals are deliberately
   * excluded from recovery.
   */
  useEffect(
    () => {

      if (
        !posDraftReady ||
        !selectedBranchId
      ) {
        return;
      }


      const timer =
        window.setTimeout(
          () => {

            if (
              cart.length ===
              0
            ) {
              clearPosSessionDraft();
              return;
            }


            savePosSessionDraft({
              branchId:
                selectedBranchId,

              customerId:
                selectedCustomerId ||
                null,

              lines:
                cart.map(
                  (item) => ({
                    productId:
                      item.id,

                    quantity:
                      item.cart_quantity,

                    discountPercent:
                      item.discount_percent,

                    overrideUnitPrice:
                      item.override_unit_price ??
                      null,
                  })
                ),
            });

          },
          120
        );


      return () =>
        window.clearTimeout(
          timer
        );

    },
    [
      posDraftReady,
      selectedBranchId,
      selectedCustomerId,
      cart,
    ]
  );


  /*
   * Browser-level protection for a live sale.
   *
   * Nexus navigation is recoverable through the
   * POS session draft. Closing/reloading the tab
   * receives an additional browser warning.
   */
  useEffect(
    () => {

      if (
        cart.length ===
        0
      ) {
        return;
      }


      function protectLiveSale(
        event: BeforeUnloadEvent
      ) {

        event.preventDefault();

        event.returnValue =
          "";

      }


      window.addEventListener(
        "beforeunload",
        protectLiveSale
      );


      return () => {

        window.removeEventListener(
          "beforeunload",
          protectLiveSale
        );

      };

    },
    [
      cart.length,
    ]
  );


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


  function setOverridePrice(
    productId: string,
    value:
      number |
      null
  ) {

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

                  override_unit_price:
                    value !== null &&
                    value > 0
                      ? value
                      : null,

                  discount_percent:
                    value !== null &&
                    value > 0
                      ? 0
                      : item.discount_percent,
                }
              : item
        )
    );
  }


  function lineTotal(
    item: CartItem
  ) {

    const base =
      (
        item.override_unit_price ??
        item.selling_price
      ) *
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


  const needsApproval =
    useMemo(
      () =>
        cart.some(
          (
            item
          ) =>
            (
              item.override_unit_price !==
                null &&
              item.override_unit_price !==
                undefined
            ) ||
            item.discount_percent >
              Number(
                workspace?.profile
                  ?.max_cashier_discount_pct ??
                0
              )
        ),
      [
        cart,
        workspace,
      ]
    );


  const splitAppliedTotal =
    splitTenders.reduce(
      (
        total,
        tender
      ) =>
        total +
        Number(
          tender.amount ||
          0
        ),
      0
    );


  const splitTenderedTotal =
    splitTenders.reduce(
      (
        total,
        tender
      ) =>
        total +
        (
          tender.payment_method ===
            "cash"
            ? Number(
                tender.amount_tendered ||
                tender.amount ||
                0
              )
            : Number(
                tender.amount ||
                0
              )
        ),
      0
    );


  const splitChangeDue =
    splitTenders.reduce(
      (
        total,
        tender
      ) => {

        if (
          tender.payment_method !==
          "cash"
        ) {
          return total;
        }


        return (
          total +
          Math.max(
            Number(
              tender.amount_tendered ||
              tender.amount ||
              0
            ) -
              Number(
                tender.amount ||
                0
              ),
            0
          )
        );
      },
      0
    );


  const splitTenderValid =
    !splitPaymentActive ||
    (
      splitTenders.length >=
        2 &&

      splitTenders.every(
        (
          tender
        ) => {

          const amount =
            Number(
              tender.amount ||
              0
            );


          if (
            amount <=
            0
          ) {
            return false;
          }


          if (
            tender.payment_method ===
            "cash"
          ) {

            return (
              Number(
                tender.amount_tendered ||
                tender.amount ||
                0
              ) >=
              amount
            );
          }


          return true;
        }
      ) &&

      Math.abs(
        splitAppliedTotal -
        cartTotal
      ) <
        0.009
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

      focusProductSearch();
    }
  }


  function loadRecalledSale(
    recalled:
      RecalledSuspendedSale
  ) {

    if (!workspace) {
      return;
    }


    const nextCart =
      recalled.items.map(
        (
          recalledItem
        ) => {

          const product =
            workspace.products.find(
              (
                item
              ) =>
                item.id ===
                recalledItem.inventory_item_id
            );


          if (!product) {

            throw new Error(
              `${recalledItem.name} is not currently available in this branch POS catalogue.`
            );
          }


          return {
            ...product,

            cart_quantity:
              Number(
                recalledItem.quantity
              ),

            discount_percent:
              recalledItem.discount_mode ===
                "percentage"
                ? Number(
                    recalledItem.discount_value
                  )
                : 0,
          };
        }
      );


    setCart(
      nextCart
    );


    setSelectedCustomerId(
      recalled.customer_id ??
      ""
    );


    setPaymentMethod(
      "cash"
    );

    setAmountTendered(
      ""
    );

    setPaymentReference(
      ""
    );


    setActiveSuspendedSaleId(
      recalled.id
    );

    setActiveSuspendedSaleNumber(
      recalled.hold_number
    );


    setSuccess(
      null
    );

    setErrorMessage(
      ""
    );
  }


  function approvalCartItems() {

    return cart.map(
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

        requested_unit_price:
          item.override_unit_price ??
          null,
      })
    );
  }


  async function requestDiscountApproval() {

    if (
      !selectedBranchId ||
      cart.length ===
        0
    ) {
      return;
    }


    const reason =
      window.prompt(
        "Why is this discount or price override needed?",
        ""
      );


    if (
      reason ===
      null
    ) {
      return;
    }


    if (
      reason.trim()
        .length <
      3
    ) {

      setErrorMessage(
        "Enter a clear reason for the approval request."
      );

      return;
    }


    try {

      setRequestingApproval(
        true
      );

      setErrorMessage(
        ""
      );


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "request_pos_approval",
          {
            p_branch_id:
              selectedBranchId,

            p_items:
              approvalCartItems(),

            p_reason:
              reason.trim(),
          }
        );


      if (error) {
        throw error;
      }


      if (
        !data?.approval_required
      ) {

        setActiveApprovalId(
          null
        );

        setActiveApprovalStatus(
          ""
        );

        setErrorMessage(
          data?.message ??
          "Approval is not required."
        );

        return;
      }


      setActiveApprovalId(
        data.approval_id
      );

      setActiveApprovalStatus(
        "pending"
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Approval request could not be created."
      );

    } finally {

      setRequestingApproval(
        false
      );
    }
  }


  async function refreshDiscountApproval() {

    if (
      !activeApprovalId ||
      !selectedBranchId
    ) {
      return;
    }


    try {

      setErrorMessage(
        ""
      );


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_pos_approval_workspace",
          {
            p_branch_id:
              selectedBranchId,
          }
        );


      if (error) {
        throw error;
      }


      const requests =
        data?.my_requests ??
        [];


      const request =
        requests.find(
          (
            row:
              {
                id: string;
                status: string;
              }
          ) =>
            row.id ===
            activeApprovalId
        );


      if (!request) {

        setErrorMessage(
          "Approval request could not be found."
        );

        return;
      }


      if (
        request.status ===
        "approved"
      ) {

        setActiveApprovalStatus(
          "approved"
        );

        return;
      }


      if (
        request.status ===
          "rejected" ||
        request.status ===
          "expired"
      ) {

        setActiveApprovalStatus(
          request.status
        );

        setActiveApprovalId(
          null
        );

        setErrorMessage(
          request.status ===
            "rejected"
            ? "The POS approval request was rejected."
            : "The POS approval request expired."
        );

        return;
      }


      setActiveApprovalStatus(
        "pending"
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Approval status could not be refreshed."
      );
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
      needsApproval &&
      activeApprovalStatus !==
        "approved"
    ) {

      setErrorMessage(
        "Approval is required before completing this sale."
      );

      return;
    }


    if (
      splitPaymentActive &&
      !splitTenderValid
    ) {

      setErrorMessage(
        "Split payment must equal the sale total."
      );

      return;
    }


    if (
      !splitPaymentActive &&
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
          splitPaymentActive
            ? "Payment: SPLIT"
            : `Payment: ${paymentMethod.toUpperCase()}`,
          !splitPaymentActive &&
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

                  requested_unit_price:
                    item.override_unit_price ??
                    null,

                  approval_id:
                    activeApprovalId ||
                    null,
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


            p_tenders:
              splitPaymentActive
                ? splitTenders.map(
                    (
                      tender
                    ) => ({
                      payment_method:
                        tender.payment_method,

                      amount:
                        Number(
                          tender.amount
                        ),

                      amount_tendered:
                        tender.payment_method ===
                          "cash"
                          ? Number(
                              tender.amount_tendered ||
                              tender.amount
                            )
                          : Number(
                              tender.amount
                            ),

                      reference:
                        tender.reference.trim() ||
                        null,
                    })
                  )
                : null,

            p_suspended_sale_id:
              activeSuspendedSaleId ||
              null,
          }
        );


      if (error) {
        throw new Error(error.message);
      }


      const result =
        data as CheckoutResult;

      if (
        !result ||
        result.ok !== true ||
        !result.pos_sale_id ||
        !result.invoice_id
      ) {
        throw new Error(
          "Sale confirmation was incomplete. Check POS receipts before trying again."
        );
      }


      setSuccess(
        result
      );


      /*
       * Server confirmed the sale.
       * This basket must never be resurrected.
       */
      clearPosSessionDraft();


      setCart([]);

      setAmountTendered("");
      setPaymentReference("");

      setSplitPaymentActive(
        false
      );

      setSplitTenders(
        []
      );
      setSelectedCustomerId("");

      setActiveApprovalId(
        null
      );

      setActiveApprovalStatus(
        ""
      );

      setActiveSuspendedSaleId(
        null
      );

      setActiveSuspendedSaleNumber(
        null
      );


      setSearch("");

      setMobileCartOpen(
        false
      );


      /*
       * Keep the cashier inside POS.
       * The success panel provides the receipt link,
       * while the till is immediately ready for
       * the next customer.
       */
      if (
        window.matchMedia(
          "(pointer: fine)"
        ).matches
      ) {
        focusProductSearch();
      }

    } catch (
      error
    ) {

      setErrorMessage(
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "POS sale could not be completed."
      );

    } finally {

      setCheckingOut(false);
    }
  }


  function startNewSale() {

    setSuccess(
      null
    );

    setErrorMessage(
      ""
    );

    setSearch(
      ""
    );

    setSelectedCustomerId(
      ""
    );

    setPaymentMethod(
      "cash"
    );

    setAmountTendered(
      ""
    );

    setPaymentReference(
      ""
    );

    setSplitPaymentActive(
      false
    );

    setSplitTenders(
      []
    );

    setMobileCartOpen(
      false
    );

    clearPosSessionDraft();


    if (
      window.matchMedia(
        "(pointer: fine)"
      ).matches
    ) {
      focusProductSearch();
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


      <main className="nexus-pos-screen mx-auto max-w-[1600px] p-3 pb-32 md:p-6 md:pb-24 lg:p-8">

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
              {/costing/i.test(errorMessage) && <Link href="/accounting/inventory-costing" className="mt-2 block font-semibold underline">Set up inventory costing to enable stock sales</Link>}
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
            <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/10 p-5 text-primary">

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


                <div className="flex w-full gap-2 sm:w-auto">

                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() =>
                      router.push(
                        `/pos/receipt/${success.pos_sale_id}`
                      )
                    }
                  >
                    <ReceiptText className="mr-2 h-4 w-4" />

                    Receipt
                  </Button>


                  <Button
                    type="button"
                    className="flex-1 sm:flex-none"
                    onClick={
                      startNewSale
                    }
                  >
                    New Sale
                  </Button>

                </div>

              </div>

            </div>
          )
        }


        {
          activeSuspendedSaleNumber && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">

              <strong>
                Recalled sale: {
                  activeSuspendedSaleNumber
                }
              </strong>

              {" "}

              Current stock and selling prices were revalidated.
              Completing checkout will close this held basket.

            </div>
          )
        }


        {
          selectedBranchId &&
          workspace?.profile?.capabilities?.suspend_sale !== false && (
            <SuspendedSalesPanel
              branchId={
                selectedBranchId
              }
              customerId={
                selectedCustomerId ||
                null
              }
              cartItems={
                cart.map(
                  (
                    item
                  ) => ({
                    id:
                      item.id,

                    cart_quantity:
                      item.cart_quantity,

                    discount_percent:
                      item.discount_percent,
                  })
                )
              }
              enabled={true}
              activeSuspendedSaleId={
                activeSuspendedSaleId
              }
              onSuspended={() => {

                setCart(
                  []
                );

                setSelectedCustomerId(
                  ""
                );

                setAmountTendered(
                  ""
                );

                setPaymentReference(
                  ""
                );

                setSuccess(
                  null
                );
              }}
              onRecall={
                loadRecalledSale
              }
            />
          )
        }


        <div className="grid gap-4 xl:grid-cols-[1fr_430px] xl:gap-6">

          <section>

            <div className="mb-3 grid items-start gap-2 md:mb-5 md:grid-cols-[220px_1fr] md:gap-3">

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Branch</span>
              <SearchableSelect searchLabel="Branches"
                value={
                  selectedBranchId
                }
                onValueChange={
                  (
                    selectedValue
                  ) =>
                    void changeBranch(
                      selectedValue
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

              </SearchableSelect>
              </label>


              <div className="grid min-w-0 gap-2">
                <label htmlFor="pos-product-search" className="text-sm font-semibold">
                  Search products
                </label>

                <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />


                <input
                  ref={productSearchRef}
                  id="pos-product-search"
                  type="search"
                  aria-describedby="pos-product-search-help"
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
                  placeholder="Product name, SKU or barcode"
                  className="w-full rounded-xl border bg-background py-3 pl-12 pr-12 text-[16px] outline-none focus:ring-2 focus:ring-primary/15 md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
                />

                <Barcode aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                </div>

                <div className="flex items-start justify-between gap-3 text-xs">
                  <p id="pos-product-search-help" className="text-muted-foreground">
                    Type to find an item, then tap it to add to your sale.
                  </p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="shrink-0 font-semibold text-primary underline underline-offset-2"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>

            </div>


            <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">

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
                      className="group min-w-0 rounded-2xl border bg-card p-3 text-left transition active:scale-[0.985] active:bg-muted/40 md:p-5 md:hover:-translate-y-1 md:hover:border-primary/30 md:hover:shadow-md"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="hidden rounded-xl bg-primary/10 p-2.5 text-primary sm:block">
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


                      <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 md:mt-5 md:text-base">
                        {
                          product.name
                        }
                      </h3>


                      <p className="mt-1 truncate text-[10px] text-muted-foreground md:text-xs">
                        {
                          product.sku
                        }
                      </p>


                      <p className="mt-3 text-base font-bold md:mt-5 md:text-xl">
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


          {/* MOBILE CART LAUNCHER */}
          {!mobileCartOpen && (
            <button
              type="button"
              onClick={() =>
                setMobileCartOpen(
                  true
                )
              }
              className="fixed inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] z-[45] flex h-14 items-center justify-between rounded-2xl border border-primary/20 bg-primary px-4 text-white shadow-xl xl:hidden"
              aria-label="Open current POS cart"
            >

              <div className="flex items-center gap-3">

                <ShoppingCart className="h-5 w-5" />

                <div className="text-left">

                  <p className="text-xs font-semibold">
                    Cart ·{" "}
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
                    }{" "}
                    items
                  </p>

                  <p className="text-[10px] opacity-80">
                    Tap to review sale
                  </p>

                </div>

              </div>


              <p className="text-base font-bold">
                {money(
                  cartTotal
                )}
              </p>

            </button>
          )}


          {/* MOBILE CART BACKDROP */}
          {mobileCartOpen && (
            <button
              type="button"
              aria-label="Close POS cart"
              onClick={() =>
                setMobileCartOpen(
                  false
                )
              }
              className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[1px] xl:hidden"
            />
          )}


          <aside
            className={
              mobileCartOpen
                ? "fixed inset-x-2 top-[64px] bottom-[calc(76px+env(safe-area-inset-bottom))] z-[70] overflow-y-auto rounded-2xl border bg-card shadow-2xl xl:sticky xl:top-4 xl:block xl:h-fit xl:overflow-visible xl:shadow-sm"
                : "hidden rounded-2xl border bg-card shadow-sm xl:sticky xl:top-4 xl:block xl:h-fit"
            }
          >

            <div className="flex justify-end border-b px-3 py-2 xl:hidden">

              <button
                type="button"
                onClick={() =>
                  setMobileCartOpen(
                    false
                  )
                }
                className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground"
              >
                Continue shopping
              </button>

            </div>

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
                <div className="divide-y xl:max-h-[430px] xl:overflow-y-auto">

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
                                  className="w-20 rounded-lg border bg-background px-2 py-2 text-right text-[16px] md:text-sm"
                                />

                              </label>
                            )
                          }


                          {
                            canRequestDiscountApproval &&
                            workspace?.profile?.capabilities?.price_override === true && (
                              <label className="mt-3 flex items-center justify-between gap-3 text-xs">

                                <span className="text-muted-foreground">
                                  Override Price
                                </span>

                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={
                                    item.override_unit_price ??
                                    ""
                                  }
                                  onChange={
                                    (
                                      event
                                    ) => {

                                      const value =
                                        event.target.value ===
                                        ""
                                          ? null
                                          : Number(
                                              event.target.value
                                            );

                                      setOverridePrice(
                                        item.id,
                                        value
                                      );
                                    }
                                  }
                                  className="w-24 rounded-lg border bg-background px-2 py-2 text-right text-[16px] md:text-sm"
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


            <div className="space-y-4 border-t p-4 xl:p-5">

              <label className="block space-y-2 text-sm">

                <span className="font-medium">
                  Customer
                </span>


                <SearchableSelect searchLabel="Customers"
                  value={
                    selectedCustomerId
                  }
                  onValueChange={
                    (
                      selectedValue
                    ) =>
                      setSelectedCustomerId(
                        selectedValue
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
                          <option data-search={[customer.number, customer.phone].filter(Boolean).join(" ")}
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

                </SearchableSelect>

              </label>


              <SplitTenderPanel
                total={
                  cartTotal
                }
                active={
                  splitPaymentActive
                }
                enabled={
                  workspace?.profile?.capabilities?.split_tender ===
                  true
                }
                tenders={
                  splitTenders
                }
                onActiveChange={
                  setSplitPaymentActive
                }
                onTendersChange={
                  setSplitTenders
                }
              />


              {
                !splitPaymentActive && (
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
                            ? "rounded-lg bg-primary px-2 py-2.5 text-xs font-semibold uppercase text-white"
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
                )
              }


              {
                !splitPaymentActive &&
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
                        className="w-full rounded-xl border bg-background py-3 pl-10 pr-3 text-[16px] md:text-sm"
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
                !splitPaymentActive &&
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
                        className="w-full rounded-xl border bg-background py-3 pl-10 pr-3 text-[16px] md:text-sm"
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
                  (
                    splitPaymentActive ||
                    paymentMethod ===
                      "cash"
                  ) &&
                  changeDue >
                    0 && (
                    <div className="flex justify-between text-sm font-semibold text-primary">

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


              {
                needsApproval && (
                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">

                    <p className="font-semibold text-primary">
                      Approval Required
                    </p>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      This cart exceeds the company self-service discount limit
                      or contains a price override.
                    </p>

                    {
                      activeApprovalStatus ===
                        "approved" ? (

                        <div className="mt-3 rounded-lg border border-primary/20 bg-background p-3 text-sm font-semibold text-primary">
                          Discount approved. Press Complete Approved Sale below to take payment, deduct stock and create the POS receipt.
                        </div>

                      ) : activeApprovalStatus ===
                          "pending" ? (

                        <div className="mt-3 flex gap-2">

                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={() =>
                              void refreshDiscountApproval()
                            }
                          >
                            Check Approval
                          </Button>

                          {
                            canApproveDiscount && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  window.open(
                                    "/pos/approvals",
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                              >
                                Open Approvals in New Tab
                              </Button>
                            )
                          }

                        </div>

                      ) : (

                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 w-full"
                          disabled={
                            !canRequestDiscountApproval ||
                            requestingApproval
                          }
                          onClick={() =>
                            void requestDiscountApproval()
                          }
                        >
                          {
                            requestingApproval
                              ? "Requesting..."
                              : "Request Approval"
                          }
                        </Button>
                      )
                    }

                  </div>
                )
              }


              <Button
                type="button"
                disabled={
                  !canSell ||
                  workspace?.profile?.enabled === false ||
                  checkingOut ||
                  (
                    splitPaymentActive &&
                    !splitTenderValid
                  ) ||
                  cart.length ===
                    0
                }
                onClick={() =>
                  void checkout()
                }
                className="h-12 w-full bg-primary text-base font-bold text-white hover:bg-primary"
              >

                {
                  checkingOut
                      ? "Processing Sale..."
                      : needsApproval &&
                          activeApprovalStatus ===
                            "approved"
                        ? "Complete Approved Sale"
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
