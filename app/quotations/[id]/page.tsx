"use client";

import ActionModal from "@/components/ui/ActionModal";

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
  createQuotationShareLink,
  getQuotationCustomerActions,
  getQuotationDeliveries,
  getQuotationShareLinks,
  recordQuotationDelivery,
  type QuotationCustomerAction,
  type QuotationDelivery,
  type QuotationShareLink,
} from "@/lib/services/quotationDeliveryService";

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

function formatDateTime(
  value: string | null | undefined
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  ).format(date);
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

  const [
    showSendPanel,
    setShowSendPanel,
  ] = useState(false);

  const [
    activeShareLink,
    setActiveShareLink,
  ] =
    useState<QuotationShareLink | null>(
      null
    );

  const [
    quotationDeliveries,
    setQuotationDeliveries,
  ] =
    useState<QuotationDelivery[]>(
      []
    );

  const [
    customerActions,
    setCustomerActions,
  ] =
    useState<QuotationCustomerAction[]>(
      []
    );

  const [
    deliveryLoading,
    setDeliveryLoading,
  ] = useState(false);

  const [
    customerEmail,
    setCustomerEmail,
  ] =
    useState<string | null>(
      null
    );

  const [
    customerPhone,
    setCustomerPhone,
  ] =
    useState<string | null>(
      null
    );

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

  async function refreshQuotation(
    silent = false
  ) {
    if (
      !currentCompanyId ||
      !quotationId
    ) {
      return;
    }

    if (!silent) {
      setLoadingQuotation(
        true
      );
    }

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

      const [
        shareLinks,
        deliveries,
        actions,
      ] = await Promise.all([
        getQuotationShareLinks(
          quotationId,
          currentCompanyId
        ),

        getQuotationDeliveries(
          quotationId,
          currentCompanyId
        ),

        getQuotationCustomerActions(
          quotationId,
          currentCompanyId
        ),
      ]);

      setActiveShareLink(
        shareLinks.find(
          (link) =>
            link.status ===
            "active"
        ) ?? null
      );

      setQuotationDeliveries(
        deliveries
      );

      setCustomerActions(
        actions
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation could not be loaded."
      );
    } finally {
      if (!silent) {
        setLoadingQuotation(
          false
        );
      }
    }
  }

  useEffect(() => {
    refreshQuotation();
  }, [
    currentCompanyId,
    quotationId,
  ]);

  useEffect(() => {
    if (
      !currentCompanyId ||
      !quotationId
    ) {
      return;
    }

    const channel = supabase
      .channel(
        `quotation-live-${quotationId}`
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quotation",
          filter: `id=eq.${quotationId}`,
        },
        async () => {
          await refreshQuotation();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table:
            "quotation_customer_action",
          filter:
            `quotation_id=eq.${quotationId}`,
        },
        async () => {
          await refreshQuotation();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "quotation_delivery",
          filter:
            `quotation_id=eq.${quotationId}`,
        },
        async () => {
          await refreshQuotation();
        }
      )
      .subscribe();

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          refreshQuotation();
        }
      };

    const handleFocus = () => {
      refreshQuotation();
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener(
      "focus",
      handleFocus
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener(
        "focus",
        handleFocus
      );

      supabase.removeChannel(
        channel
      );
    };
  }, [
    currentCompanyId,
    quotationId,
  ]);

  // quotation-status-auto-refresh
  useEffect(() => {
    if (
      !currentCompanyId ||
      !quotationId
    ) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          void refreshQuotation(
            true
          );
        },
        2500
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    currentCompanyId,
    quotationId,
  ]);

  useEffect(() => {
    async function loadCustomerContact() {
      if (
        !currentCompanyId ||
        !quotation?.customer_id
      ) {
        setCustomerEmail(null);
        setCustomerPhone(null);
        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from("customer")
        .select(
          "email, phone, alternative_phone"
        )
        .eq(
          "id",
          quotation.customer_id
        )
        .eq(
          "company_id",
          currentCompanyId
        )
        .maybeSingle();

      if (error) {
        console.error(
          "Customer contact details could not be loaded:",
          error.message
        );

        return;
      }

      setCustomerEmail(
        data?.email?.trim() ||
          null
      );

      setCustomerPhone(
        data?.phone?.trim() ||
          data?.alternative_phone?.trim() ||
          null
      );
    }

    void loadCustomerContact();
  }, [
    currentCompanyId,
    quotation?.customer_id,
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
    if (
      !quotation ||
      !currentCompanyId
    ) {
      return;
    }

    if (
      quotationItems.length === 0
    ) {
      setPageError(
        "Add at least one item before sending the quotation."
      );
      return;
    }

    try {
      setDeliveryLoading(true);
      setPageError("");
      setMessage("");

      const result =
        await createQuotationShareLink(
          quotation.id
        );

      const links =
        await getQuotationShareLinks(
          quotation.id,
          currentCompanyId
        );

      setActiveShareLink(
        links.find(
          (link) =>
            link.id ===
            result.share_link.id
        ) ??
          links.find(
            (link) =>
              link.status ===
              "active"
          ) ??
          null
      );

      setShowSendPanel(true);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation sharing could not be prepared."
      );
    } finally {
      setDeliveryLoading(false);
    }
  }

  async function copyQuotationLink() {
    if (
      !quotation ||
      !currentCompanyId
    ) {
      return;
    }

    try {
      setDeliveryLoading(true);
      setPageError("");
      setMessage("");

      let shareLink =
        activeShareLink;

      if (!shareLink) {
        const created =
          await createQuotationShareLink(
            quotation.id
          );

        const links =
          await getQuotationShareLinks(
            quotation.id,
            currentCompanyId
          );

        shareLink =
          links.find(
            (link) =>
              link.id ===
              created.share_link.id
          ) ?? null;

        setActiveShareLink(
          shareLink
        );
      }

      if (!shareLink) {
        throw new Error(
          "Secure quotation link could not be created."
        );
      }

      const publicUrl =
        `${window.location.origin}/quote/${shareLink.token}`;

      await navigator.clipboard.writeText(
        publicUrl
      );

      await recordQuotationDelivery(
        quotation.id,
        shareLink.id,
        "copied_link",
        null,
        {
          quotation_number:
            quotation.quotation_number,
        }
      );

      setMessage(
        "Secure quotation link copied. The quotation is now recorded as Sent."
      );

      await refreshQuotation();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation link could not be copied."
      );
    } finally {
      setDeliveryLoading(false);
    }
  }

  async function ensureQuotationShareLink() {
    if (
      !quotation ||
      !currentCompanyId
    ) {
      throw new Error(
        "Quotation could not be identified."
      );
    }

    if (activeShareLink) {
      return activeShareLink;
    }

    const created =
      await createQuotationShareLink(
        quotation.id
      );

    const links =
      await getQuotationShareLinks(
        quotation.id,
        currentCompanyId
      );

    const shareLink =
      links.find(
        (link) =>
          link.id ===
          created.share_link.id
      ) ??
      links.find(
        (link) =>
          link.status ===
          "active"
      ) ??
      null;

    if (!shareLink) {
      throw new Error(
        "Secure quotation link could not be created."
      );
    }

    setActiveShareLink(
      shareLink
    );

    return shareLink;
  }

  function quotationPublicUrl(
    token: string
  ) {
    return `${window.location.origin}/quote/${token}`;
  }

  async function shareQuotationByEmail() {
    if (!quotation) {
      return;
    }

    if (!customerEmail) {
      setPageError(
        "This customer does not have an email address saved."
      );

      return;
    }

    try {
      setDeliveryLoading(true);
      setPageError("");
      setMessage("");

      const shareLink =
        await ensureQuotationShareLink();

      const publicUrl =
        quotationPublicUrl(
          shareLink.token
        );

      const subject =
        `Quotation ${quotation.quotation_number}`;

      const body = [
        `Good day,`,
        ``,
        `Please find quotation ${quotation.quotation_number} for ${formatCurrency(
          Number(
            quotation.total_amount
          )
        )}.`,
        ``,
        `View and respond to the quotation securely here:`,
        publicUrl,
        ``,
        `Kind regards,`,
        companyName,
      ].join("\\n");

      await recordQuotationDelivery(
        quotation.id,
        shareLink.id,
        "email",
        customerEmail,
        {
          quotation_number:
            quotation.quotation_number,
          handoff:
            "mailto",
        }
      );

      const mailto =
        `mailto:${encodeURIComponent(
          customerEmail
        )}` +
        `?subject=${encodeURIComponent(
          subject
        )}` +
        `&body=${encodeURIComponent(
          body
        )}`;

      window.location.href =
        mailto;

      setMessage(
        `Email prepared for ${customerEmail}.`
      );

      await refreshQuotation(
        true
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Quotation email could not be prepared."
      );
    } finally {
      setDeliveryLoading(false);
    }
  }

  function normaliseWhatsAppNumber(
    value: string
  ) {
    const original =
      value.trim();

    if (
      /[a-zA-Z]/.test(
        original
      )
    ) {
      throw new Error(
        "The customer's phone number contains invalid characters."
      );
    }

    let number =
      original.replace(
        /[^0-9]/g,
        ""
      );

    if (
      number.startsWith("0")
    ) {
      number =
        `27${number.slice(1)}`;
    }

    if (
      number.startsWith(
        "0027"
      )
    ) {
      number =
        number.slice(2);
    }

    if (
      number.length < 10 ||
      number.length > 15
    ) {
      throw new Error(
        "The customer's phone number is invalid."
      );
    }

    return number;
  }

  async function shareQuotationByWhatsApp() {
    if (!quotation) {
      return;
    }

    if (!customerPhone) {
      setPageError(
        "This customer does not have a phone number saved."
      );

      return;
    }

    try {
      setDeliveryLoading(true);
      setPageError("");
      setMessage("");

      const shareLink =
        await ensureQuotationShareLink();

      const publicUrl =
        quotationPublicUrl(
          shareLink.token
        );

      const phone =
        normaliseWhatsAppNumber(
          customerPhone
        );

      if (
        phone.length < 9
      ) {
        throw new Error(
          "The customer's phone number is invalid."
        );
      }

      const whatsappMessage = [
        `Good day,`,
        ``,
        `${companyName} has prepared quotation ${quotation.quotation_number}.`,
        ``,
        `Quotation Total: ${formatCurrency(
          Number(
            quotation.total_amount
          )
        )}`,
        ``,
        `View and respond securely:`,
        publicUrl,
      ].join("\\n");

      await recordQuotationDelivery(
        quotation.id,
        shareLink.id,
        "whatsapp",
        customerPhone,
        {
          quotation_number:
            quotation.quotation_number,
          handoff:
            "whatsapp",
        }
      );

      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(
          whatsappMessage
        )}`,
        "_blank",
        "noopener,noreferrer"
      );

      setMessage(
        `WhatsApp quotation prepared for ${customerPhone}.`
      );

      await refreshQuotation(
        true
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "WhatsApp quotation could not be prepared."
      );
    } finally {
      setDeliveryLoading(false);
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
            {quotation && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(
                    `/quotations/${quotation.id}/print`
                  )
                }
              >
                Print / Save PDF
              </Button>
            )}

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

            {quotation &&
              ["draft", "sent"].includes(
                quotation.status
              ) &&
              can(
                "quotation.send"
              ) && (
                <Button
                  type="button"
                  onClick={
                    sendQuotation
                  }
                  disabled={
                    deliveryLoading
                  }
                  className="bg-black text-white hover:bg-black/85"
                >
                  {deliveryLoading
                    ? "Preparing..."
                    : "Send Quotation"}
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

        {showSendPanel &&
          quotation &&
          can("quotation.send") && (
            <section className="mb-6 rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    Send Quotation
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Share a secure customer link for{" "}
                    {quotation.quotation_number}.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setShowSendPanel(
                      false
                    )
                  }
                >
                  Close
                </Button>
              </div>

              <div className="mt-5 rounded-lg border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Secure Customer Link
                </p>

                {activeShareLink ? (
                  <>
                    <p className="mt-2 break-all text-sm">
                      {`${typeof window !== "undefined"
                        ? window.location.origin
                        : ""}/quote/${activeShareLink.token}`}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        onClick={
                          copyQuotationLink
                        }
                        disabled={
                          deliveryLoading
                        }
                        className="bg-black text-white hover:bg-black/85"
                      >
                        {deliveryLoading
                          ? "Working..."
                          : "Copy Secure Link"}
                      </Button>

                      {quotation.status ===
                        "sent" && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            window.open(
                              `/quote/${activeShareLink.token}`,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          Open Customer View
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        onClick={
                          shareQuotationByEmail
                        }
                        disabled={
                          deliveryLoading ||
                          !customerEmail
                        }
                        title={
                          customerEmail
                            ? `Send to ${customerEmail}`
                            : "Customer has no email address"
                        }
                      >
                        Email
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={
                          shareQuotationByWhatsApp
                        }
                        disabled={
                          deliveryLoading ||
                          !customerPhone
                        }
                        title={
                          customerPhone
                            ? `Send to ${customerPhone}`
                            : "Customer has no phone number"
                        }
                      >
                        WhatsApp
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          window.open(
                            `/quotations/${quotation.id}/print`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        Print / Save PDF
                      </Button>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Creating the link alone does not mark
                      the quotation as sent. Copying the link
                      records a delivery and changes Draft to Sent.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Preparing secure quotation link...
                  </p>
                )}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border">
                  <div className="border-b p-4">
                    <p className="font-semibold">
                      Delivery Activity
                    </p>
                  </div>

                  {quotationDeliveries.length ===
                  0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      No deliveries recorded yet.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {quotationDeliveries
                        .slice(0, 6)
                        .map(
                          (
                            delivery
                          ) => (
                            <div
                              key={
                                delivery.id
                              }
                              className="flex items-center justify-between gap-4 p-4"
                            >
                              <div>
                                <p className="text-sm font-semibold">
                                  {statusLabel(
                                    delivery.delivery_method
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatDateTime(
                                    delivery.sent_at ??
                                      delivery.created_at
                                  )}
                                </p>
                              </div>

                              <span className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase">
                                {
                                  delivery.status
                                }
                              </span>
                            </div>
                          )
                        )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border">
                  <div className="border-b p-4">
                    <p className="font-semibold">
                      Customer Activity
                    </p>
                  </div>

                  {customerActions.length ===
                  0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      The customer has not opened or
                      responded to this quotation yet.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {customerActions
                        .slice(0, 6)
                        .map(
                          (
                            action
                          ) => (
                            <div
                              key={
                                action.id
                              }
                              className="p-4"
                            >
                              <div className="flex items-center justify-between gap-4">
                                <p className="text-sm font-semibold">
                                  {statusLabel(
                                    action.action
                                  )}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                  {formatDateTime(
                                    action.occurred_at
                                  )}
                                </p>
                              </div>

                              {action.message && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {
                                    action.message
                                  }
                                </p>
                              )}
                            </div>
                          )
                        )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

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

        <ActionModal
          open={showItemForm}
          title={
            editingItem
              ? "Edit Item"
              : "Add Item"
          }
          subtitle="Add a product or service to this quotation."
          onClose={closeItemForm}
          maxWidth="max-w-3xl"
        >
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
        </ActionModal>

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
