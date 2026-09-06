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
  Building2,
  CheckCircle2,
  CreditCard,
  Package,
  ReceiptText,
  RotateCcw,
  Save,
  Settings2,
  ShoppingCart,
  Users,
  Wrench,
} from "lucide-react";

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


type CapabilityMap =
  Record<
    string,
    boolean
  >;


type PosTemplate = {
  key: string;
  name: string;
  description: string;
  capabilities: CapabilityMap;
};


type ReceiptOptions = {
  paper_size?: string;
  auto_print?: boolean;
  show_cashier?: boolean;
  show_branch?: boolean;
};


type PosSettings = {
  profile_key: string;
  enabled: boolean;
  display_name: string;

  allow_walk_in_customer: boolean;
  require_customer: boolean;
  require_cashier_session: boolean;

  max_cashier_discount_pct: number;
  supervisor_discount_threshold_pct: number;

  capability_overrides: CapabilityMap;
  receipt_options: ReceiptOptions;
};


type PosSettingsWorkspace = {
  ok: boolean;

  settings: PosSettings;

  active_profile: {
    key: string;
    name: string;
    description: string;
    base_capabilities: CapabilityMap;
    effective_capabilities: CapabilityMap;
  };

  templates: PosTemplate[];

  can_manage: boolean;
};


const capabilityGroups = [
  {
    title: "Checkout",
    items: [
      {
        key: "barcode",
        label: "Barcode Scanning",
        description:
          "Search and add products using barcode scanners.",
        ready: true,
      },
      {
        key: "product_grid",
        label: "Product Grid",
        description:
          "Fast visual product selection for counter sales.",
        ready: true,
      },
      {
        key: "inventory_sales",
        label: "Inventory Sales",
        description:
          "Sell physical stock and reduce branch inventory automatically.",
        ready: true,
      },
      {
        key: "service_sales",
        label: "Service Sales",
        description:
          "Allow labour and non-stock service items.",
        ready: false,
      },
      {
        key: "suspend_sale",
        label: "Suspend & Recall",
        description:
          "Pause a sale and continue it later.",
        ready: false,
      },
      {
        key: "split_tender",
        label: "Split Payments",
        description:
          "Pay one transaction using multiple payment methods.",
        ready: false,
      },
    ],
  },

  {
    title: "Customers & Pricing",
    items: [
      {
        key: "walk_in_customer",
        label: "Walk-in Customers",
        description:
          "Allow quick sales without selecting a named customer.",
        ready: true,
      },
      {
        key: "account_sales",
        label: "Account Sales",
        description:
          "Sell to customer accounts and manage credit.",
        ready: false,
      },
      {
        key: "discounts",
        label: "Discounts",
        description:
          "Allow authorised discounts during checkout.",
        ready: true,
      },
      {
        key: "price_override",
        label: "Price Override",
        description:
          "Allow authorised selling-price changes.",
        ready: false,
      },
      {
        key: "promotions",
        label: "Promotions",
        description:
          "Automatic specials and promotional pricing.",
        ready: false,
      },
      {
        key: "loyalty",
        label: "Customer Loyalty",
        description:
          "Loyalty points, rewards and member pricing.",
        ready: false,
      },
      {
        key: "bulk_pricing",
        label: "Bulk Pricing",
        description:
          "Quantity-based and wholesale price levels.",
        ready: false,
      },
    ],
  },

  {
    title: "Control & Hardware",
    items: [
      {
        key: "returns",
        label: "Returns",
        description:
          "Controlled product return workflows.",
        ready: false,
      },
      {
        key: "exchanges",
        label: "Exchanges",
        description:
          "Exchange returned products for other items.",
        ready: false,
      },
      {
        key: "receipt_printing",
        label: "Receipt Printing",
        description:
          "Thermal and printable POS receipt support.",
        ready: false,
      },
      {
        key: "cash_drawer",
        label: "Cash Drawer",
        description:
          "Cash drawer and till control integration.",
        ready: false,
      },
      {
        key: "customer_display",
        label: "Customer Display",
        description:
          "Second-screen customer basket and payment display.",
        ready: false,
      },
      {
        key: "branch_stock_lookup",
        label: "Branch Stock Lookup",
        description:
          "View stock availability across authorised branches.",
        ready: true,
      },
    ],
  },

  {
    title: "Industry Capabilities",
    items: [
      {
        key: "job_cards",
        label: "Job Cards",
        description:
          "Repair and service job-card workflow.",
        ready: false,
      },
      {
        key: "serial_tracking",
        label: "Serial / IMEI Tracking",
        description:
          "Track individual devices or serialized stock.",
        ready: false,
      },
      {
        key: "deposits",
        label: "Deposits",
        description:
          "Customer deposits before final completion.",
        ready: false,
      },
      {
        key: "learner_accounts",
        label: "Learner Accounts",
        description:
          "School learner and parent payment workflows.",
        ready: false,
      },
      {
        key: "tables",
        label: "Tables & Tabs",
        description:
          "Hospitality table and open-tab workflows.",
        ready: false,
      },
      {
        key: "kitchen",
        label: "Kitchen Workflow",
        description:
          "Send hospitality orders to preparation areas.",
        ready: false,
      },
      {
        key: "delivery",
        label: "Delivery",
        description:
          "Delivery and fulfilment workflow.",
        ready: false,
      },
    ],
  },
];


export default function PosSettingsPage() {

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


  const canManage =
    can(
      "pos.manage"
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      PosSettingsWorkspace |
      null
    >(null);


  const [
    settings,
    setSettings,
  ] =
    useState<
      PosSettings |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");


  async function loadSettings() {

    try {

      setLoading(true);
      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_pos_profile_settings"
        );


      if (error) {
        throw error;
      }


      const next =
        data as PosSettingsWorkspace;


      setWorkspace(
        next
      );


      setSettings({
        ...next.settings,

        receipt_options: {
          paper_size:
            next.settings
              .receipt_options
              ?.paper_size ??
            "80mm",

          auto_print:
            next.settings
              .receipt_options
              ?.auto_print ??
            false,

          show_cashier:
            next.settings
              .receipt_options
              ?.show_cashier ??
            true,

          show_branch:
            next.settings
              .receipt_options
              ?.show_branch ??
            true,
        },
      });

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "POS settings could not be loaded."
      );

    } finally {

      setLoading(false);
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


      void loadSettings();

    },
    [
      permissionsLoading,
      canView,
    ]
  );


  async function logout() {

    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  const selectedTemplate =
    useMemo(
      () =>
        workspace
          ?.templates.find(
            (
              template
            ) =>
              template.key ===
              settings?.profile_key
          ) ??
        null,
      [
        workspace,
        settings?.profile_key,
      ]
    );


  const effectiveCapabilities =
    useMemo(
      () => ({
        ...(
          selectedTemplate
            ?.capabilities ??
          {}
        ),

        ...(
          settings
            ?.capability_overrides ??
          {}
        ),
      }),
      [
        selectedTemplate,
        settings?.capability_overrides,
      ]
    );


  function chooseProfile(
    template:
      PosTemplate
  ) {

    if (!settings) {
      return;
    }


    setSettings({
      ...settings,

      profile_key:
        template.key,

      capability_overrides:
        {},

      allow_walk_in_customer:
        Boolean(
          template
            .capabilities
            .walk_in_customer
        ),

      require_customer:
        !Boolean(
          template
            .capabilities
            .walk_in_customer
        ),
    });


    setSuccessMessage("");
  }


  function toggleCapability(
    key: string
  ) {

    if (
      !settings ||
      !selectedTemplate
    ) {
      return;
    }


    const current =
      Boolean(
        effectiveCapabilities[
          key
        ]
      );


    const base =
      Boolean(
        selectedTemplate
          .capabilities[
            key
          ]
      );


    const desired =
      !current;


    const nextOverrides = {
      ...settings
        .capability_overrides,
    };


    if (
      desired ===
      base
    ) {

      delete nextOverrides[
        key
      ];

    } else {

      nextOverrides[
        key
      ] =
        desired;
    }


    setSettings({
      ...settings,

      capability_overrides:
        nextOverrides,
    });
  }


  function resetProfile() {

    if (
      !settings ||
      !selectedTemplate
    ) {
      return;
    }


    setSettings({
      ...settings,

      capability_overrides:
        {},

      allow_walk_in_customer:
        Boolean(
          selectedTemplate
            .capabilities
            .walk_in_customer
        ),

      require_customer:
        !Boolean(
          selectedTemplate
            .capabilities
            .walk_in_customer
        ),
    });
  }


  async function save() {

    if (!settings) {
      return;
    }


    try {

      setSaving(true);

      setErrorMessage("");
      setSuccessMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "save_pos_profile_settings",
          {
            p_profile_key:
              settings.profile_key,

            p_enabled:
              settings.enabled,

            p_display_name:
              settings.display_name,

            p_allow_walk_in_customer:
              settings
                .allow_walk_in_customer,

            p_require_customer:
              settings
                .require_customer,

            p_require_cashier_session:
              settings
                .require_cashier_session,

            p_max_cashier_discount_pct:
              settings
                .max_cashier_discount_pct,

            p_supervisor_discount_threshold_pct:
              settings
                .supervisor_discount_threshold_pct,

            p_capability_overrides:
              settings
                .capability_overrides,

            p_receipt_options:
              settings
                .receipt_options,
          }
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        data?.message ??
        "POS profile saved."
      );


      await loadSettings();

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "POS settings could not be saved."
      );

    } finally {

      setSaving(false);
    }
  }


  if (
    permissionsLoading ||
    loading
  ) {

    return (
      <DashboardLayout>

        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-7xl p-6 lg:p-8">

          <p className="text-sm text-muted-foreground">
            Loading Point of Sale settings...
          </p>

        </main>

      </DashboardLayout>
    );
  }


  if (
    !canView ||
    !settings ||
    !workspace
  ) {

    return (
      <DashboardLayout>

        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-5xl p-6">

          <div className="rounded-2xl border bg-card p-6">

            <h1 className="text-xl font-bold">
              POS Settings Restricted
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have access to Point of Sale configuration.
            </p>

          </div>

        </main>

      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={
          logout
        }
      />


      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

        <button
          type="button"
          onClick={() =>
            router.push(
              "/settings"
            )
          }
          className="mb-5 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Settings
        </button>


        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">

          <div>

            <p className="text-sm font-semibold text-muted-foreground">
              Sales & Point of Sale
            </p>


            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Adaptive POS Setup
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Choose how Nexus POS should behave for this business.
              The sales, stock and Accounting engine remains universal
              while the checkout experience adapts to the company.
            </p>

          </div>


          {
            canManage && (
              <Button
                type="button"
                disabled={
                  saving
                }
                onClick={() =>
                  void save()
                }
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >

                <Save className="mr-2 h-4 w-4" />

                {
                  saving
                    ? "Saving..."
                    : "Save POS Setup"
                }

              </Button>
            )
          }

        </div>


        {
          errorMessage && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {
                errorMessage
              }
            </div>
          )
        }


        {
          successMessage && (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {
                successMessage
              }
            </div>
          )
        }


        <section className="rounded-2xl border bg-card">

          <div className="border-b p-5">

            <h2 className="text-lg font-semibold">
              Business POS Profile
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Start with the closest business model. You can customise
              individual capabilities below.
            </p>

          </div>


          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">

            {
              workspace.templates.map(
                (
                  template
                ) => {

                  const selected =
                    template.key ===
                    settings.profile_key;


                  return (
                    <button
                      key={
                        template.key
                      }
                      type="button"
                      disabled={
                        !canManage
                      }
                      onClick={() =>
                        chooseProfile(
                          template
                        )
                      }
                      className={
                        selected
                          ? "rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5 text-left"
                          : "rounded-2xl border bg-background p-5 text-left transition hover:border-emerald-300 hover:bg-muted/20"
                      }
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="rounded-xl bg-muted p-2.5">

                          {
                            template.key ===
                              "retail" ? (
                              <ShoppingCart className="h-5 w-5" />
                            ) : template.key ===
                              "repair_service" ? (
                              <Wrench className="h-5 w-5" />
                            ) : template.key ===
                              "school_payments" ? (
                              <Users className="h-5 w-5" />
                            ) : template.key ===
                              "wholesale_b2b" ? (
                              <Package className="h-5 w-5" />
                            ) : template.key ===
                              "hospitality" ? (
                              <CreditCard className="h-5 w-5" />
                            ) : (
                              <Building2 className="h-5 w-5" />
                            )
                          }

                        </div>


                        {
                          selected && (
                            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                          )
                        }

                      </div>


                      <h3 className="mt-4 font-bold">
                        {
                          template.name
                        }
                      </h3>


                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {
                          template.description
                        }
                      </p>

                    </button>
                  );
                }
              )
            }

          </div>

        </section>


        <section className="mt-8 rounded-2xl border bg-card">

          <div className="border-b p-5">

            <h2 className="text-lg font-semibold">
              Core POS Rules
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              These rules apply regardless of industry profile.
            </p>

          </div>


          <div className="grid gap-5 p-5 md:grid-cols-2">

            <label className="rounded-xl border p-4">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="font-semibold">
                    POS Enabled
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Allow this company to use Point of Sale.
                  </p>

                </div>


                <input
                  type="checkbox"
                  checked={
                    settings.enabled
                  }
                  disabled={
                    !canManage
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSettings({
                        ...settings,
                        enabled:
                          event.target.checked,
                      })
                  }
                  className="mt-1 h-5 w-5"
                />

              </div>

            </label>


            <label className="space-y-2 rounded-xl border p-4">

              <span className="font-semibold">
                POS Display Name
              </span>

              <input
                value={
                  settings.display_name
                }
                disabled={
                  !canManage
                }
                onChange={
                  (
                    event
                  ) =>
                    setSettings({
                      ...settings,
                      display_name:
                        event.target.value,
                    })
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
                placeholder="Point of Sale"
              />

            </label>


            <label className="rounded-xl border p-4">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="font-semibold">
                    Allow Walk-in Customer
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Quick checkout without selecting a named customer.
                  </p>

                </div>


                <input
                  type="checkbox"
                  checked={
                    settings
                      .allow_walk_in_customer
                  }
                  disabled={
                    !canManage
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSettings({
                        ...settings,

                        allow_walk_in_customer:
                          event.target.checked,

                        require_customer:
                          event.target.checked
                            ? false
                            : settings.require_customer,
                      })
                  }
                  className="mt-1 h-5 w-5"
                />

              </div>

            </label>


            <label className="rounded-xl border p-4">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="font-semibold">
                    Require Named Customer
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Every sale must be linked to a customer account.
                  </p>

                </div>


                <input
                  type="checkbox"
                  checked={
                    settings
                      .require_customer
                  }
                  disabled={
                    !canManage
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSettings({
                        ...settings,

                        require_customer:
                          event.target.checked,

                        allow_walk_in_customer:
                          event.target.checked
                            ? false
                            : settings
                                .allow_walk_in_customer,
                      })
                  }
                  className="mt-1 h-5 w-5"
                />

              </div>

            </label>


            <label className="space-y-2 rounded-xl border p-4">

              <span className="font-semibold">
                Cashier Discount Limit %
              </span>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={
                  settings
                    .max_cashier_discount_pct
                }
                disabled={
                  !canManage
                }
                onChange={
                  (
                    event
                  ) =>
                    setSettings({
                      ...settings,

                      max_cashier_discount_pct:
                        Number(
                          event.target.value
                        ),
                    })
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

              <p className="text-xs text-muted-foreground">
                Larger discounts require a POS manager.
              </p>

            </label>


            <label className="rounded-xl border p-4">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="font-semibold">
                    Require Cashier Session
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Block POS checkout until the cashier opens a till
                    session for the selected branch.
                  </p>

                </div>


                <input
                  type="checkbox"
                  checked={
                    settings
                      .require_cashier_session
                  }
                  disabled={
                    !canManage
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSettings({
                        ...settings,

                        require_cashier_session:
                          event.target.checked,
                      })
                  }
                  className="mt-1 h-5 w-5"
                />

              </div>

            </label>

          </div>

        </section>


        <section className="mt-8 rounded-2xl border bg-card">

          <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">

            <div>

              <h2 className="text-lg font-semibold">
                POS Capabilities
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Your selected profile provides defaults. Override only
                what this business needs.
              </p>

            </div>


            {
              canManage && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={
                    resetProfile
                  }
                >

                  <RotateCcw className="mr-2 h-4 w-4" />

                  Reset to Profile

                </Button>
              )
            }

          </div>


          <div className="space-y-8 p-5">

            {
              capabilityGroups.map(
                (
                  group
                ) => (
                  <div
                    key={
                      group.title
                    }
                  >

                    <h3 className="mb-3 font-semibold">
                      {
                        group.title
                      }
                    </h3>


                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">

                      {
                        group.items.map(
                          (
                            item
                          ) => {

                            const enabled =
                              Boolean(
                                effectiveCapabilities[
                                  item.key
                                ]
                              );


                            const overridden =
                              Object.prototype
                                .hasOwnProperty
                                .call(
                                  settings
                                    .capability_overrides,
                                  item.key
                                );


                            return (
                              <button
                                key={
                                  item.key
                                }
                                type="button"
                                disabled={
                                  !canManage
                                }
                                onClick={() =>
                                  toggleCapability(
                                    item.key
                                  )
                                }
                                className={
                                  enabled
                                    ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left"
                                    : "rounded-xl border bg-background p-4 text-left opacity-70"
                                }
                              >

                                <div className="flex items-start justify-between gap-3">

                                  <div>

                                    <p className="font-semibold">
                                      {
                                        item.label
                                      }
                                    </p>


                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                      {
                                        item.description
                                      }
                                    </p>

                                  </div>


                                  <div className="flex flex-col items-end gap-2">

                                    <span
                                      className={
                                        enabled
                                          ? "rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-semibold uppercase text-white"
                                          : "rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase"
                                      }
                                    >
                                      {
                                        enabled
                                          ? "On"
                                          : "Off"
                                      }
                                    </span>


                                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                                      {
                                        item.ready
                                          ? "Available"
                                          : "Planned"
                                      }
                                    </span>

                                  </div>

                                </div>


                                {
                                  overridden && (
                                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                      Company override
                                    </p>
                                  )
                                }

                              </button>
                            );
                          }
                        )
                      }

                    </div>

                  </div>
                )
              )
            }

          </div>

        </section>


        <section className="mt-8 rounded-2xl border bg-card">

          <div className="border-b p-5">

            <div className="flex items-center gap-3">

              <ReceiptText className="h-5 w-5" />

              <div>

                <h2 className="text-lg font-semibold">
                  Receipt Preferences
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Receipt hardware integration comes in a later POS sprint,
                  but the company preference is stored now.
                </p>

              </div>

            </div>

          </div>


          <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">

            <label className="space-y-2">

              <span className="text-sm font-medium">
                Paper Size
              </span>

              <select
                value={
                  settings
                    .receipt_options
                    .paper_size ??
                  "80mm"
                }
                disabled={
                  !canManage
                }
                onChange={
                  (
                    event
                  ) =>
                    setSettings({
                      ...settings,

                      receipt_options: {
                        ...settings
                          .receipt_options,

                        paper_size:
                          event.target.value,
                      },
                    })
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              >

                <option value="80mm">
                  80 mm Thermal
                </option>

                <option value="58mm">
                  58 mm Thermal
                </option>

                <option value="a4">
                  A4
                </option>

              </select>

            </label>


            {
              [
                {
                  key:
                    "auto_print",
                  label:
                    "Auto Print",
                },
                {
                  key:
                    "show_cashier",
                  label:
                    "Show Cashier",
                },
                {
                  key:
                    "show_branch",
                  label:
                    "Show Branch",
                },
              ].map(
                (
                  option
                ) => (
                  <label
                    key={
                      option.key
                    }
                    className="flex items-center justify-between rounded-xl border p-4"
                  >

                    <span className="text-sm font-medium">
                      {
                        option.label
                      }
                    </span>


                    <input
                      type="checkbox"
                      checked={
                        Boolean(
                          settings
                            .receipt_options[
                              option.key as keyof ReceiptOptions
                            ]
                        )
                      }
                      disabled={
                        !canManage
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setSettings({
                            ...settings,

                            receipt_options: {
                              ...settings
                                .receipt_options,

                              [option.key]:
                                event.target.checked,
                            },
                          })
                      }
                      className="h-5 w-5"
                    />

                  </label>
                )
              )
            }

          </div>

        </section>


        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-5">

          <div className="flex items-start gap-3">

            <Settings2 className="mt-0.5 h-5 w-5 text-emerald-700" />

            <div>

              <p className="font-semibold">
                {
                  selectedTemplate
                    ?.name ??
                  "POS"
                }
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Nexus will use these capabilities to progressively adapt
                checkout as the remaining POS sprints are added.
              </p>

            </div>

          </div>


          {
            canManage && (
              <Button
                type="button"
                disabled={
                  saving
                }
                onClick={() =>
                  void save()
                }
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >

                <Save className="mr-2 h-4 w-4" />

                Save POS Setup

              </Button>
            )
          }

        </div>

      </main>

    </DashboardLayout>
  );
}
