"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useParams,
  useRouter,
} from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import QuotationItemForm from "@/components/QuotationItemForm";
import { Button } from "@/components/ui/button";

import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";
import { convertQuotationToSalesOrder } from "@/lib/services/salesService";

import {
  addQuotationItem,
  changeQuotationStatus,
  deleteQuotationItem,
  getQuotation,
  updateQuotationItem,
} from "@/lib/services/quotationService";

import { supabase } from "@/lib/supabase";

import type {
  Quotation,
  QuotationItem,
  QuotationItemFormData,
} from "@/types/quotation";

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

function statusLabel(
  value: string
) {
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default function QuotationDetailPage() {
  const router = useRouter();
  const params = useParams();

  const quotationId =
    String(params.id);

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
    quotation,
    setQuotation,
  ] =
    useState<Quotation | null>(
      null
    );

  const [
    quotationItems,
    setQuotationItems,
  ] = useState<
    QuotationItem[]
  >([]);

  const [
    showItemForm,
    setShowItemForm,
  ] = useState(false);

  const [
    editingItem,
    setEditingItem,
  ] =
    useState<QuotationItem | null>(
      null
    );

  const [
    loadingQuotation,
    setLoadingQuotation,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState("");

  const {
    items: inventoryItems,
  } = useInventory(
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
        data: profile,
        error: profileError,
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

      if (
        profileError ||
        !profile
      ) {
        setPageError(
          profileError?.message ??
            "Profile could not be loaded."
        );

        return;
      }

      setUserName(
        profile.full_name
      );

      if (
        !profile.company_id
      ) {
        setPageError(
          "Your account is not linked to a company."
        );
        return;
      }

      setCurrentCompanyId(
        profile.company_id
      );

      const {
        data: company,
      } = await supabase
        .from("company")
        .select(
          "company_name"
        )
        .eq(
          "id",
          profile.company_id
        )
        .single();

      if (
        company?.company_name
      ) {
        setCompanyName(
          company.company_name
        );
      }
    }

    initialisePage();
  }, [router]);

  async function refreshQuotation() {
    if (
      !currentCompanyId ||
      !quotationId
    ) {
      return;
    }

    setLoadingQuotation(
      true
    );

    setPageError("");

    try {
      const result =
        await getQuotation(
          quotationId,
          currentCompanyId
        );

      setQuotation(
        result.quotation
      );

      setQuotationItems(
        result.items
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation could not be loaded."
      );
    } finally {
      setLoadingQuotation(
        false
      );
    }
  }

  useEffect(() => {
    refreshQuotation();
  }, [
    currentCompanyId,
    quotationId,
  ]);

  const inventoryMap =
    useMemo(() => {
      return new Map(
        inventoryItems.map(
          (item) => [
            item.id,
            item,
          ]
        )
      );
    }, [inventoryItems]);

  function openAddItem() {
    if (
      !can(
        "quotation.update"
      )
    ) {
      setPageError(
        "You do not have permission to modify quotations."
      );
      return;
    }

    setEditingItem(null);
    setShowItemForm(true);
    setMessage("");
    setPageError("");
  }

  function openEditItem(
    item: QuotationItem
  ) {
    if (
      !can(
        "quotation.update"
      )
    ) {
      return;
    }

    setEditingItem(item);
    setShowItemForm(true);
    setMessage("");
    setPageError("");
  }

  function closeItemForm() {
    setEditingItem(null);
    setShowItemForm(false);
  }

  async function saveQuotationItem(
    data: QuotationItemFormData
  ) {
    if (
      !currentCompanyId ||
      !quotation
    ) {
      throw new Error(
        "Quotation could not be identified."
      );
    }

    if (
      quotation.status !==
      "draft"
    ) {
      throw new Error(
        "Only draft quotations can be edited."
      );
    }

    if (editingItem) {
      const updated =
        await updateQuotationItem(
          editingItem.id,
          currentCompanyId,
          data
        );

      try {
        await createAuditLog({
          company_id:
            currentCompanyId,

          action:
            "update",

          module:
            "quotations",

          record_id:
            updated.id,

          description:
            `Updated quotation item on ${quotation.quotation_number}`,

          metadata: {
            quotation_number:
              quotation.quotation_number,

            description:
              updated.description,

            quantity:
              updated.quantity,

            unit_price:
              updated.unit_price,
          },
        });
      } catch {
        // Audit failure must not block quote editing.
      }

      setMessage(
        "Quotation item updated."
      );
    } else {
      const created =
        await addQuotationItem(
          quotation.id,
          currentCompanyId,
          data
        );

      try {
        await createAuditLog({
          company_id:
            currentCompanyId,

          action:
            "create",

          module:
            "quotations",

          record_id:
            created.id,

          description:
            `Added quotation item to ${quotation.quotation_number}`,

          metadata: {
            description:
              created.description,

            quantity:
              created.quantity,

            unit_price:
              created.unit_price,
          },
        });
      } catch {
        // Audit failure must not block quote editing.
      }

      setMessage(
        "Quotation item added."
      );
    }

    closeItemForm();

    await refreshQuotation();
  }

  async function removeQuotationItem(
    item: QuotationItem
  ) {
    if (
      !quotation ||
      quotation.status !==
        "draft"
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Remove "${item.description}" from this quotation?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteQuotationItem(
        item.id,
        currentCompanyId
      );

      setMessage(
        "Quotation item removed."
      );

      await refreshQuotation();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation item could not be removed."
      );
    }
  }

  async function sendQuotation() {
    if (!quotation) {
      return;
    }

    if (
      quotationItems.length ===
      0
    ) {
      setPageError(
        "Add at least one item before sending the quotation."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Mark ${quotation.quotation_number} as Sent?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const updated =
        await changeQuotationStatus(
          quotation.id,
          currentCompanyId,
          "sent"
        );

      setQuotation(
        updated
      );

      setMessage(
        `${updated.quotation_number} marked as Sent.`
      );

      try {
        await createAuditLog({
          company_id:
            currentCompanyId,

          action:
            "update",

          module:
            "quotations",

          record_id:
            updated.id,

          description:
            `Sent quotation: ${updated.quotation_number}`,

          metadata: {
            status:
              updated.status,

            total_amount:
              updated.total_amount,
          },
        });
      } catch {
        // Do not block status change.
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation could not be sent."
      );
    }
  }

  async function acceptQuotation() {
    if (!quotation) {
      return;
    }

    const confirmed =
      window.confirm(
        `Mark ${quotation.quotation_number} as Accepted?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const updated =
        await changeQuotationStatus(
          quotation.id,
          currentCompanyId,
          "accepted"
        );

      setQuotation(
        updated
      );

      setMessage(
        `${updated.quotation_number} accepted.`
      );

      try {
        await createAuditLog({
          company_id:
            currentCompanyId,

          action:
            "update",

          module:
            "quotations",

          record_id:
            updated.id,

          description:
            `Accepted quotation: ${updated.quotation_number}`,

          metadata: {
            status:
              updated.status,

            total_amount:
              updated.total_amount,
          },
        });
      } catch {
        // Do not block status change.
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation could not be accepted."
      );
    }
  }

  async function declineQuotation() {
    if (!quotation) {
      return;
    }

    const confirmed =
      window.confirm(
        `Mark ${quotation.quotation_number} as Declined?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const updated =
        await changeQuotationStatus(
          quotation.id,
          currentCompanyId,
          "declined"
        );

      setQuotation(
        updated
      );

      setMessage(
        `${updated.quotation_number} declined.`
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation could not be declined."
      );
    }
  }

  async function cancelQuotation() {
    if (!quotation) {
      return;
    }

    const confirmed =
      window.confirm(
        `Cancel ${quotation.quotation_number}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const updated =
        await changeQuotationStatus(
          quotation.id,
          currentCompanyId,
          "cancelled"
        );

      setQuotation(
        updated
      );

      setMessage(
        `${updated.quotation_number} cancelled.`
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation could not be cancelled."
      );
    }
  }

  async function convertToSalesOrder() {
    if (
      !quotation ||
      !currentCompanyId
    ) {
      return;
    }

    try {
      setPageError("");

      const salesOrder =
        await convertQuotationToSalesOrder(
          quotation.id,
          currentCompanyId
        );

      router.push(
        `/sales/${salesOrder.id}`
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation could not be converted to a sales order."
      );
    }
  }

  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }

  const rows =
    quotationItems.map(
      (item) => {
        const inventoryItem =
          item.inventory_item_id
            ? inventoryMap.get(
                item.inventory_item_id
              )
            : null;

        return [
          <div
            key={`${item.id}-description`}
          >
            <p className="font-semibold">
              {
                item.description
              }
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {inventoryItem
                ? `SKU: ${inventoryItem.sku}`
                : "Custom item / service"}
            </p>
          </div>,

          Number(
            item.quantity
          ).toFixed(3),

          formatCurrency(
            Number(
              item.unit_price
            )
          ),

          `${Number(
            item.discount_rate
          ).toFixed(1)}%`,

          `${Number(
            item.tax_rate
          ).toFixed(1)}%`,

          formatCurrency(
            Number(
              item.line_subtotal
            )
          ),

          formatCurrency(
            Number(
              item.line_discount
            )
          ),

          formatCurrency(
            Number(
              item.line_tax
            )
          ),

          formatCurrency(
            Number(
              item.line_total
            )
          ),

          <div
            key={`${item.id}-actions`}
            className="flex flex-wrap gap-2"
          >
            {quotation?.status ===
              "draft" &&
              can(
                "quotation.update"
              ) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openEditItem(
                      item
                    )
                  }
                >
                  Edit
                </Button>
              )}

            {quotation?.status ===
              "draft" &&
              can(
                "quotation.update"
              ) && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    removeQuotationItem(
                      item
                    )
                  }
                >
                  Remove
                </Button>
              )}
          </div>,
        ];
      }
    );

  const visibleError =
    pageError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can(
      "quotation.view"
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
          onLogout={logout}
        />

        <main className="p-8">
          Access denied.
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
        <section className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link
              href="/quotations"
              className="text-sm font-medium text-primary"
            >
              ← Quotations
            </Link>

            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {quotation?.quotation_number ??
                "Quotation"}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {quotation && (
                <span className="rounded-full border px-3 py-1 text-sm font-medium">
                  {statusLabel(
                    quotation.status
                  )}
                </span>
              )}

              {quotation && (
                <span className="text-sm text-muted-foreground">
                  Date:{" "}
                  {
                    quotation.quotation_date
                  }
                </span>
              )}

              {quotation?.valid_until && (
                <span className="text-sm text-muted-foreground">
                  Valid until:{" "}
                  {
                    quotation.valid_until
                  }
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {quotation?.status ===
              "draft" &&
              can(
                "quotation.update"
              ) &&
              !showItemForm && (
                <Button
                  type="button"
                  onClick={
                    openAddItem
                  }
                >
                  + Add Item
                </Button>
              )}

            {quotation?.status ===
              "draft" &&
              can(
                "quotation.send"
              ) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={
                    sendQuotation
                  }
                >
                  Mark as Sent
                </Button>
              )}

            {quotation?.status ===
              "sent" &&
              can(
                "quotation.accept"
              ) && (
                <>
                  <Button
                    type="button"
                    onClick={
                      acceptQuotation
                    }
                  >
                    Accept
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    onClick={
                      declineQuotation
                    }
                  >
                    Decline
                  </Button>
                </>
              )}

            {quotation?.status ===
              "accepted" && (
                <Button
                  type="button"
                  onClick={
                    convertToSalesOrder
                  }
                >
                  Convert to Sales Order
                </Button>
              )}

            {quotation &&
              ![
                "accepted",
                "declined",
                "cancelled",
              ].includes(
                quotation.status
              ) &&
              can(
                "quotation.update"
              ) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={
                    cancelQuotation
                  }
                >
                  Cancel Quote
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
            <QuotationItemForm
              inventoryItems={
                inventoryItems
              }
              item={
                editingItem
              }
              onSave={
                saveQuotationItem
              }
              onCancel={
                closeItemForm
              }
            />
          </div>
        )}

        {quotation && (
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Subtotal
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  Number(
                    quotation.subtotal
                  )
                )}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Discount
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  Number(
                    quotation.discount_amount
                  )
                )}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                VAT
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  Number(
                    quotation.tax_amount
                  )
                )}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Quote Total
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  Number(
                    quotation.total_amount
                  )
                )}
              </p>
            </div>
          </section>
        )}

        {loadingQuotation ||
        permissionsLoading ? (
          <div className="rounded-xl border p-10 text-center">
            Loading quotation...
          </div>
        ) : (
          <DataTable
            headers={[
              "Description",
              "Qty",
              "Unit Price",
              "Discount",
              "VAT",
              "Subtotal",
              "Discount Value",
              "Tax",
              "Total",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No quotation items yet."
          />
        )}

        {quotation?.notes && (
          <section className="mt-8 rounded-xl border bg-card p-6">
            <h2 className="mb-3 text-lg font-semibold">Notes</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {quotation.notes}
            </p>
          </section>
        )}
      </main>
    </DashboardLayout>
  );
}