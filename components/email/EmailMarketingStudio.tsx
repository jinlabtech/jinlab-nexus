"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  email_account_id: string;
  template_id: string;
  template_version_id: string;
  audience_id: string;
  status:
    | "draft"
    | "ready"
    | "scheduled"
    | "processing"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed";
  subject_override: string | null;
  preheader_override: string | null;
  scheduled_at: string | null;
  timezone: string;
  requires_approval: boolean;
  approved_at: string | null;
  track_opens: boolean;
  track_clicks: boolean;
  created_at: string;
  updated_at: string;
};

type Audience = {
  id: string;
  name: string;
  description: string | null;
  audience_type: "static" | "dynamic";
  status: "active" | "archived";
};

type AudienceMember = {
  id: string;
  audience_id: string;
  customer_id: string | null;
  email_address: string;
  display_name: string | null;
  member_status: "active" | "excluded";
};

type Mailbox = {
  id: string;
  email_address: string;
  display_name: string | null;
  active: boolean;
};

type MarketingTemplate = {
  id: string;
  name: string;
  category: string;
  published_version_id: string | null;
  status: string;
};

type CampaignRecipient = {
  campaign_id: string;
  consent_status: string;
  suppression_reason: string | null;
  send_status: string;
};

type PreviewBlock = {
  id?: string;
  type: string;
  text?: string;
  url?: string;
  imageUrl?: string;
  altText?: string;
};

type TemplateVersion = {
  id: string;
  template_id: string;
  version_no: number;
  subject_template: string | null;
  preheader_template: string | null;
  content_blocks: {
    blocks?: PreviewBlock[];
  };
  status: string;
  published_at: string | null;
};

type MarketingConsent = {
  id: string;
  address: string;
  status: "granted" | "denied" | "withdrawn" | "pending";
  channel: string;
  purpose: string;
};

type MarketingSuppression = {
  id: string;
  address: string;
  scope: "marketing" | "all";
  reason: string;
  active: boolean;
  channel: string;
};

type CampaignForm = {
  name: string;
  description: string;
  mailboxId: string;
  templateId: string;
  audienceId: string;
  subjectOverride: string;
  preheaderOverride: string;
  scheduledAt: string;
  requiresApproval: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
};

const emptyCampaign: CampaignForm = {
  name: "",
  description: "",
  mailboxId: "",
  templateId: "",
  audienceId: "",
  subjectOverride: "",
  preheaderOverride: "",
  scheduledAt: "",
  requiresApproval: false,
  trackOpens: true,
  trackClicks: true,
};

export default function EmailMarketingStudio() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [trashingId, setTrashingId] = useState("");
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audienceMembers, setAudienceMembers] = useState<AudienceMember[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [templateVersions, setTemplateVersions] =
    useState<TemplateVersion[]>([]);
  const [marketingConsents, setMarketingConsents] =
    useState<MarketingConsent[]>([]);
  const [marketingSuppressions, setMarketingSuppressions] =
    useState<MarketingSuppression[]>([]);

  const [campaignForm, setCampaignForm] = useState<CampaignForm>(emptyCampaign);

  const [audienceName, setAudienceName] = useState("");
  const [audienceDescription, setAudienceDescription] = useState("");

  const [selectedAudienceId, setSelectedAudienceId] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberConsentConfirmed, setMemberConsentConfirmed] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingAudience, setSavingAudience] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [preparingId, setPreparingId] = useState("");
  const [approvingId, setApprovingId] = useState("");
  const [queueingId, setQueueingId] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    const [
      campaignResult,
      audienceResult,
      memberResult,
      mailboxResult,
      templateResult,
      recipientResult,
      templateVersionResult,
      consentResult,
      suppressionResult,
    ] = await Promise.all([
      supabase
        .from("email_campaign")
        .select(
          "id, name, description, email_account_id, template_id, template_version_id, audience_id, status, subject_override, preheader_override, scheduled_at, timezone, requires_approval, approved_at, track_opens, track_clicks, created_at, updated_at"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),

      supabase
        .from("marketing_audience")
        .select("id, name, description, audience_type, status")
        .order("updated_at", { ascending: false }),

      supabase
        .from("marketing_audience_member")
        .select(
          "id, audience_id, customer_id, email_address, display_name, member_status"
        ),

      supabase
        .from("email_account")
        .select("id, email_address, display_name, active")
        .eq("active", true)
        .order("email_address"),

      supabase
        .from("communication_template")
        .select("id, name, category, published_version_id, status")
        .eq("channel", "email")
        .eq("purpose", "marketing")
        .eq("status", "active")
        .not("published_version_id", "is", null)
        .order("updated_at", { ascending: false }),

      supabase
        .from("email_campaign_recipient")
        .select(
          "campaign_id, consent_status, suppression_reason, send_status"
        ),

      supabase
        .from("communication_template_version")
        .select(
          "id, template_id, version_no, subject_template, preheader_template, content_blocks, status, published_at"
        )
        .eq("status", "published"),

      supabase
        .from("communication_consent")
        .select("id, address, status, channel, purpose")
        .eq("channel", "email")
        .eq("purpose", "marketing"),

      supabase
        .from("communication_suppression")
        .select("id, address, scope, reason, active, channel")
        .eq("channel", "email")
        .eq("active", true),
    ]);

    const firstError =
      campaignResult.error ||
      audienceResult.error ||
      memberResult.error ||
      mailboxResult.error ||
      templateResult.error ||
      recipientResult.error ||
      templateVersionResult.error ||
      consentResult.error ||
      suppressionResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const { data: ownerData } =
      await supabase.rpc(
        "current_user_is_owner"
      );

    setIsOwner(
      Boolean(ownerData)
    );

    setCampaigns((campaignResult.data ?? []) as Campaign[]);
    setAudiences((audienceResult.data ?? []) as Audience[]);
    setAudienceMembers((memberResult.data ?? []) as AudienceMember[]);
    setMailboxes((mailboxResult.data ?? []) as Mailbox[]);
    setTemplates((templateResult.data ?? []) as MarketingTemplate[]);
    setRecipients((recipientResult.data ?? []) as CampaignRecipient[]);
    setTemplateVersions(
      (templateVersionResult.data ?? []) as TemplateVersion[]
    );
    setMarketingConsents(
      (consentResult.data ?? []) as MarketingConsent[]
    );
    setMarketingSuppressions(
      (suppressionResult.data ?? []) as MarketingSuppression[]
    );

    setSelectedAudienceId((current) => {
      if (
        current &&
        (audienceResult.data ?? []).some((item) => item.id === current)
      ) {
        return current;
      }

      return audienceResult.data?.[0]?.id ?? "";
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === campaignForm.templateId) ?? null,
    [templates, campaignForm.templateId]
  );

  const selectedTemplateVersion = useMemo(() => {
    if (!selectedTemplate?.published_version_id) {
      return null;
    }

    return (
      templateVersions.find(
        (version) =>
          version.id === selectedTemplate.published_version_id
      ) ?? null
    );
  }, [selectedTemplate, templateVersions]);

  function normaliseEmail(value: string) {
    return value.trim().toLowerCase();
  }

  function getAudienceCompliance(audienceId: string) {
    const members = audienceMembers.filter(
      (member) =>
        member.audience_id === audienceId &&
        member.member_status === "active"
    );

    let granted = 0;
    let suppressed = 0;
    let eligible = 0;

    for (const member of members) {
      const email = normaliseEmail(member.email_address);

      const consent = marketingConsents.find(
        (item) =>
          normaliseEmail(item.address) === email &&
          item.channel === "email" &&
          item.purpose === "marketing"
      );

      const suppression = marketingSuppressions.find(
        (item) =>
          normaliseEmail(item.address) === email &&
          item.channel === "email" &&
          item.active &&
          (item.scope === "marketing" || item.scope === "all")
      );

      if (consent?.status === "granted") {
        granted += 1;
      }

      if (suppression) {
        suppressed += 1;
      }

      if (consent?.status === "granted" && !suppression) {
        eligible += 1;
      }
    }

    return {
      total: members.length,
      granted,
      suppressed,
      eligible,
      unknown: Math.max(0, members.length - granted),
      sample: members.slice(0, 5),
    };
  }

  const selectedCampaignAudience = useMemo(
    () =>
      audiences.find(
        (item) => item.id === campaignForm.audienceId
      ) ?? null,
    [audiences, campaignForm.audienceId]
  );

  const selectedCampaignMailbox = useMemo(
    () =>
      mailboxes.find(
        (item) => item.id === campaignForm.mailboxId
      ) ?? null,
    [mailboxes, campaignForm.mailboxId]
  );

  function getAudienceMemberCount(audienceId: string) {
    return audienceMembers.filter(
      (member) =>
        member.audience_id === audienceId &&
        member.member_status === "active"
    ).length;
  }

  const selectedAudienceMembers = useMemo(
    () =>
      audienceMembers.filter(
        (member) =>
          member.audience_id === selectedAudienceId &&
          member.member_status === "active"
      ),
    [audienceMembers, selectedAudienceId]
  );

  const totalRecipients = recipients.length;
  const eligibleRecipients = recipients.filter(
    (recipient) =>
      recipient.send_status !== "skipped" &&
      recipient.consent_status === "granted"
  ).length;

  const suppressedRecipients = recipients.filter(
    (recipient) =>
      recipient.send_status === "skipped" ||
      Boolean(recipient.suppression_reason)
  ).length;

  const readyCampaigns = campaigns.filter(
    (campaign) => campaign.status === "ready"
  ).length;

  async function createAudience(event: FormEvent) {
    event.preventDefault();

    if (!audienceName.trim()) {
      setError("Audience name is required.");
      return;
    }

    setSavingAudience(true);
    setError("");
    setNotice("");

    const { data, error: rpcError } = await supabase.rpc(
      "marketing_create_audience",
      {
        p_name: audienceName.trim(),
        p_description: audienceDescription.trim() || null,
        p_branch_id: null,
        p_audience_type: "static",
        p_filter_config: {},
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSavingAudience(false);
      return;
    }

    const result = data as { audience_id?: string };

    setAudienceName("");
    setAudienceDescription("");
    setNotice("Audience created.");

    await loadWorkspace();

    if (result?.audience_id) {
      setSelectedAudienceId(result.audience_id);
    }

    setSavingAudience(false);
  }

  async function addAudienceMember(event: FormEvent) {
    event.preventDefault();

    if (!selectedAudienceId) {
      setError("Select an audience first.");
      return;
    }

    if (!memberEmail.trim()) {
      setError("Email address is required.");
      return;
    }

    setSavingMember(true);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "marketing_add_audience_member",
      {
        p_audience_id: selectedAudienceId,
        p_customer_id: null,
        p_email_address: memberEmail.trim(),
        p_display_name: memberName.trim() || null,
        p_variables: {},
        p_source: "manual",
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSavingMember(false);
      return;
    }

    if (memberConsentConfirmed) {
      const { error: consentError } = await supabase.rpc(
        "marketing_set_email_consent",
        {
          p_email_address: memberEmail.trim(),
          p_status: "granted",
          p_customer_id: null,
          p_source: "manual",
          p_legal_basis: "consent",
          p_evidence: {
            source: "nexus_audience_management",
          },
        }
      );

      if (consentError) {
        setError(
          `Audience member added, but consent could not be recorded: ${consentError.message}`
        );
        await loadWorkspace();
        setSavingMember(false);
        return;
      }
    }

    setMemberEmail("");
    setMemberName("");
    setMemberConsentConfirmed(false);

    setNotice(
      memberConsentConfirmed
        ? "Audience member added and marketing consent recorded."
        : "Audience member added. Marketing consent is still required before sending."
    );

    await loadWorkspace();
    setSavingMember(false);
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();

    if (!campaignForm.name.trim()) {
      setError("Campaign name is required.");
      return;
    }

    if (!campaignForm.mailboxId) {
      setError("Select a sending mailbox.");
      return;
    }

    if (!selectedTemplate?.published_version_id) {
      setError("Select a published marketing template.");
      return;
    }

    if (!campaignForm.audienceId) {
      setError("Select an audience.");
      return;
    }

    setSavingCampaign(true);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "marketing_create_campaign",
      {
        p_name: campaignForm.name.trim(),
        p_email_account_id: campaignForm.mailboxId,
        p_template_id: selectedTemplate.id,
        p_template_version_id: selectedTemplate.published_version_id,
        p_audience_id: campaignForm.audienceId,
        p_description: campaignForm.description.trim() || null,
        p_branch_id: null,
        p_subject_override: campaignForm.subjectOverride.trim() || null,
        p_preheader_override: campaignForm.preheaderOverride.trim() || null,
        p_scheduled_at: campaignForm.scheduledAt
          ? new Date(campaignForm.scheduledAt).toISOString()
          : null,
        p_timezone: "Africa/Johannesburg",
        p_requires_approval: campaignForm.requiresApproval,
        p_track_opens: campaignForm.trackOpens,
        p_track_clicks: campaignForm.trackClicks,
        p_settings: {},
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSavingCampaign(false);
      return;
    }

    setCampaignForm(emptyCampaign);
    setNotice("Campaign created as draft.");

    await loadWorkspace();
    setSavingCampaign(false);
  }

  async function trashCampaign(
    campaignId: string
  ) {
    if (!isOwner) {
      return;
    }

    if (
      !window.confirm(
        "Move this campaign to the Nexus Recycle Bin? Any queued unsent deliveries will be cancelled."
      )
    ) {
      return;
    }

    setTrashingId(
      campaignId
    );

    const {
      error: rpcError,
    } =
      await supabase.rpc(
        "marketing_owner_trash_campaign",
        {
          p_campaign_id:
            campaignId,
        }
      );

    if (rpcError) {
      window.alert(
        rpcError.message
      );

      setTrashingId("");
      return;
    }

    setCampaigns(
      (current) =>
        current.filter(
          (campaign) =>
            campaign.id !==
            campaignId
        )
    );

    setTrashingId("");
  }


  async function prepareCampaign(campaignId: string) {
    setPreparingId(campaignId);
    setError("");
    setNotice("");

    const { data, error: rpcError } = await supabase.rpc(
      "marketing_prepare_campaign",
      {
        p_campaign_id: campaignId,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setPreparingId("");
      return;
    }

    const result = data as {
      recipient_count?: number;
      eligible_count?: number;
      skipped_count?: number;
    };

    setNotice(
      `Campaign prepared. ${result.eligible_count ?? 0} eligible, ${
        result.skipped_count ?? 0
      } skipped.`
    );

    await loadWorkspace();
    setPreparingId("");
  }

  async function approveCampaign(campaignId: string) {
    setApprovingId(campaignId);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "marketing_approve_campaign",
      {
        p_campaign_id: campaignId,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setApprovingId("");
      return;
    }

    setNotice("Campaign approved and ready for launch.");

    await loadWorkspace();
    setApprovingId("");
  }

  async function queueCampaign(campaignId: string) {
    const confirmed = window.confirm(
      "Queue this campaign for delivery? Nexus will recheck consent and suppression rules before creating send jobs."
    );

    if (!confirmed) {
      return;
    }

    setQueueingId(campaignId);
    setError("");
    setNotice("");

    const { data, error: rpcError } = await supabase.rpc(
      "marketing_queue_campaign",
      {
        p_campaign_id: campaignId,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setQueueingId("");
      return;
    }

    const result = data as {
      queued_count?: number;
      existing_job_count?: number;
      skipped_count?: number;
      campaign_status?: string;
    };

    setNotice(
      `Campaign queued. ${result.queued_count ?? 0} new jobs, ${
        result.existing_job_count ?? 0
      } already queued, ${result.skipped_count ?? 0} skipped.`
    );

    await loadWorkspace();
    setQueueingId("");
  }

  function campaignRecipientStats(campaignId: string) {
    const rows = recipients.filter(
      (recipient) => recipient.campaign_id === campaignId
    );

    return {
      total: rows.length,
      eligible: rows.filter(
        (recipient) =>
          recipient.consent_status === "granted" &&
          recipient.send_status !== "skipped"
      ).length,
      skipped: rows.filter(
        (recipient) => recipient.send_status === "skipped"
      ).length,
    };
  }

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground">
        Loading Nexus Campaign Studio...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            Nexus Communications
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Email Marketing
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Create audiences, prepare campaigns and manage consent-aware
            communication from one workspace.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/email"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Email
          </Link>

          <Link
            href="/email/templates"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Templates
          </Link>

          <Link
            href="/email/marketing/recurring"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Recurring Campaigns
          </Link>

          <Link
            href="/email/bulk"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Bulk Email
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Campaigns</div>
          <div className="mt-2 text-3xl font-semibold">{campaigns.length}</div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Ready campaigns</div>
          <div className="mt-2 text-3xl font-semibold">{readyCampaigns}</div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Eligible recipients</div>
          <div className="mt-2 text-3xl font-semibold">{eligibleRecipients}</div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Suppressed / skipped</div>
          <div className="mt-2 text-3xl font-semibold">{suppressedRecipients}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">Campaigns</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Prepare recipient lists before sending.
              </p>
            </div>

            <div className="divide-y">
              {campaigns.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No campaigns yet. Create your first campaign on the right.
                </div>
              ) : (
                campaigns.map((campaign) => {
                  const stats = campaignRecipientStats(campaign.id);

                  return (
                    <div key={campaign.id} className="p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="font-medium">{campaign.name}</div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            {campaign.status.toUpperCase()}
                            {campaign.scheduled_at
                              ? ` · ${new Date(
                                  campaign.scheduled_at
                                ).toLocaleString()}`
                              : ""}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span>{stats.total} recipients</span>
                            <span>{stats.eligible} eligible</span>
                            <span>{stats.skipped} skipped</span>
                          </div>

                          {campaign.requires_approval ? (
                            <div className="mt-2 text-xs">
                              {campaign.approved_at ? (
                                <span className="font-medium text-green-700">
                                  Approval complete
                                </span>
                              ) : (
                                <span className="font-medium text-amber-700">
                                  Approval required
                                </span>
                              )}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {campaign.status === "draft" ? (
                            <button
                              type="button"
                              disabled={preparingId === campaign.id}
                              onClick={() =>
                                void prepareCampaign(campaign.id)
                              }
                              className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                            >
                              {preparingId === campaign.id
                                ? "Preparing..."
                                : "Prepare Campaign"}
                            </button>
                          ) : null}

                          {campaign.status === "ready" &&
                          campaign.requires_approval &&
                          !campaign.approved_at ? (
                            <button
                              type="button"
                              disabled={approvingId === campaign.id}
                              onClick={() =>
                                void approveCampaign(campaign.id)
                              }
                              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                            >
                              {approvingId === campaign.id
                                ? "Approving..."
                                : "Approve Campaign"}
                            </button>
                          ) : null}

                          {campaign.status === "ready" &&
                          (!campaign.requires_approval ||
                            Boolean(campaign.approved_at)) ? (
                            <button
                              type="button"
                              disabled={queueingId === campaign.id}
                              onClick={() =>
                                void queueCampaign(campaign.id)
                              }
                              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                            >
                              {queueingId === campaign.id
                                ? "Queueing..."
                                : "Queue Campaign"}
                            </button>
                          ) : null}

                          {isOwner ? (
                            <button
                              type="button"
                              disabled={
                                trashingId === campaign.id
                              }
                              onClick={() =>
                                void trashCampaign(
                                  campaign.id
                                )
                              }
                              className="rounded-md border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              {trashingId === campaign.id
                                ? "Moving..."
                                : "Move to Recycle Bin"}
                            </button>
                          ) : null}

                          {campaign.status === "scheduled" ? (
                            <span className="rounded-full bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-700">
                              Scheduled
                            </span>
                          ) : null}

                          {campaign.status === "processing" ? (
                            <span className="rounded-full bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
                              Queued for processing
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">Audience Management</h2>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <form onSubmit={createAudience} className="space-y-4">
                <div className="font-medium">Create audience</div>

                <input
                  value={audienceName}
                  onChange={(event) => setAudienceName(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Audience name"
                />

                <textarea
                  value={audienceDescription}
                  onChange={(event) =>
                    setAudienceDescription(event.target.value)
                  }
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Description"
                />

                <button
                  type="submit"
                  disabled={savingAudience}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingAudience ? "Creating..." : "Create Audience"}
                </button>
              </form>

              <form onSubmit={addAudienceMember} className="space-y-4">
                <div className="font-medium">Add audience member</div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Select audience
                  </div>

                  <div className="grid gap-2">
                    {audiences
                      .filter((audience) => audience.status === "active")
                      .map((audience) => {
                        const selected =
                          selectedAudienceId === audience.id;

                        return (
                          <button
                            key={audience.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setSelectedAudienceId(audience.id)
                            }
                            className={`rounded-lg border p-3 text-left transition ${
                              selected
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "hover:border-primary/40 hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium">
                                  {audience.name}
                                </div>

                                <div className="mt-1 text-xs text-muted-foreground">
                                  {audience.audience_type === "static"
                                    ? "Static audience"
                                    : "Dynamic audience"}
                                  {" · "}
                                  {getAudienceMemberCount(audience.id)} members
                                </div>
                              </div>

                              <div
                                className={`h-4 w-4 rounded-full border ${
                                  selected
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground/40"
                                }`}
                              />
                            </div>
                          </button>
                        );
                      })}

                    {audiences.filter(
                      (audience) => audience.status === "active"
                    ).length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Create an audience first.
                      </div>
                    ) : null}
                  </div>
                </div>

                <input
                  value={memberName}
                  onChange={(event) => setMemberName(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Customer / contact name"
                />

                <input
                  type="email"
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Email address"
                />

                <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={memberConsentConfirmed}
                    onChange={(event) =>
                      setMemberConsentConfirmed(event.target.checked)
                    }
                    className="mt-0.5"
                  />

                  <span>
                    <span className="font-medium">
                      Marketing consent confirmed
                    </span>

                    <span className="mt-1 block text-xs text-muted-foreground">
                      Confirm only when this contact has given permission
                      to receive marketing email.
                    </span>
                  </span>
                </label>

                <div className="text-xs text-muted-foreground">
                  {selectedAudienceMembers.length} active members in selected
                  audience.
                </div>

                <button
                  type="submit"
                  disabled={savingMember}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {savingMember ? "Adding..." : "Add Member"}
                </button>
              </form>
            </div>
          </section>
        </div>

        <form
          onSubmit={createCampaign}
          className="h-fit space-y-5 rounded-xl border bg-card p-5 xl:sticky xl:top-4"
        >
          <div>
            <h2 className="text-lg font-semibold">New Campaign</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Campaigns remain drafts until prepared.
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Campaign name</span>
            <input
              value={campaignForm.name}
              onChange={(event) =>
                setCampaignForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="September customer promotion"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={campaignForm.description}
              onChange={(event) =>
                setCampaignForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-medium">Sending mailbox</span>

            <div className="grid gap-2">
              {mailboxes.map((mailbox) => {
                const selected =
                  campaignForm.mailboxId === mailbox.id;

                return (
                  <button
                    key={mailbox.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setCampaignForm((current) => ({
                        ...current,
                        mailboxId: mailbox.id,
                      }))
                    }
                    className={`rounded-lg border p-3 text-left transition ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {mailbox.display_name || "Business mailbox"}
                        </div>

                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {mailbox.email_address}
                        </div>
                      </div>

                      <div
                        className={`h-4 w-4 shrink-0 rounded-full border ${
                          selected
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/40"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}

              {mailboxes.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No active sending mailbox is available.
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                Marketing template
              </span>

              <Link
                href="/email/templates"
                className="text-xs font-medium text-primary hover:underline"
              >
                Manage templates
              </Link>
            </div>

            <div className="grid gap-2">
              {templates.map((template) => {
                const selected =
                  campaignForm.templateId === template.id;

                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setCampaignForm((current) => ({
                        ...current,
                        templateId: template.id,
                      }))
                    }
                    className={`rounded-lg border p-3 text-left transition ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">
                          {template.name}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {template.category
                              .replaceAll("_", " ")
                              .replace(
                                /\b\w/g,
                                (letter) => letter.toUpperCase()
                              )}
                          </span>

                          <span className="text-[11px] text-muted-foreground">
                            Published
                          </span>
                        </div>
                      </div>

                      <div
                        className={`h-4 w-4 shrink-0 rounded-full border ${
                          selected
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/40"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}

              {templates.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No published marketing templates yet.
                  <div className="mt-2">
                    <Link
                      href="/email/templates"
                      className="font-medium text-primary hover:underline"
                    >
                      Create a marketing template
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {selectedTemplate ? (
            <div className="overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">
                    Template Preview
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {selectedTemplate.name}
                  </div>
                </div>

                <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                  Published
                </span>
              </div>

              <div className="border-b px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Subject
                </div>

                <div className="mt-1 text-sm font-medium">
                  {selectedTemplateVersion?.subject_template ||
                    "No subject configured"}
                </div>

                {selectedTemplateVersion?.preheader_template ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selectedTemplateVersion.preheader_template}
                  </div>
                ) : null}
              </div>

              <div className="bg-muted/40 p-4">
                <div className="mx-auto max-w-[520px] space-y-3 rounded-lg bg-background p-5 shadow-sm">
                  {selectedTemplateVersion?.content_blocks?.blocks?.length ? (
                    selectedTemplateVersion.content_blocks.blocks
                      .slice(0, 8)
                      .map((block, index) => {
                        if (block.type === "heading") {
                          return (
                            <div
                              key={block.id ?? index}
                              className="text-lg font-semibold"
                            >
                              {block.text || "Heading"}
                            </div>
                          );
                        }

                        if (block.type === "text") {
                          return (
                            <div
                              key={block.id ?? index}
                              className="text-sm leading-6 text-muted-foreground"
                            >
                              {block.text || "Text"}
                            </div>
                          );
                        }

                        if (
                          block.type === "button" ||
                          block.type === "shipment_tracking"
                        ) {
                          return (
                            <div key={block.id ?? index}>
                              <span className="inline-block rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
                                {block.text || "Action"}
                              </span>
                            </div>
                          );
                        }

                        if (block.type === "image") {
                          return (
                            <div
                              key={block.id ?? index}
                              className="rounded-md border border-dashed bg-muted/30 p-5 text-center text-xs text-muted-foreground"
                            >
                              Image
                            </div>
                          );
                        }

                        if (block.type === "divider") {
                          return (
                            <hr
                              key={block.id ?? index}
                              className="border-border"
                            />
                          );
                        }

                        if (block.type === "spacer") {
                          return (
                            <div
                              key={block.id ?? index}
                              className="h-3"
                            />
                          );
                        }

                        return null;
                      })
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No preview blocks available.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <span className="text-sm font-medium">Audience</span>

            <div className="grid gap-2 sm:grid-cols-2">
              {audiences
                .filter((audience) => audience.status === "active")
                .map((audience) => {
                  const selected =
                    campaignForm.audienceId === audience.id;

                  const memberCount =
                    getAudienceMemberCount(audience.id);

                  return (
                    <button
                      key={audience.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setCampaignForm((current) => ({
                          ...current,
                          audienceId: audience.id,
                        }))
                      }
                      className={`rounded-lg border p-3 text-left transition ${
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">
                            {audience.name}
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            {memberCount} active member
                            {memberCount === 1 ? "" : "s"}
                          </div>
                        </div>

                        <div
                          className={`h-4 w-4 shrink-0 rounded-full border ${
                            selected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/40"
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}

              {audiences.filter(
                (audience) => audience.status === "active"
              ).length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:col-span-2">
                  No active audiences yet. Create one in Audience Management.
                </div>
              ) : null}
            </div>
          </div>

          {selectedCampaignAudience ? (() => {
            const stats = getAudienceCompliance(
              selectedCampaignAudience.id
            );

            return (
              <div className="overflow-hidden rounded-xl border">
                <div className="border-b bg-muted/30 px-4 py-3">
                  <div className="text-sm font-medium">
                    Audience Readiness
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {selectedCampaignAudience.name}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <div className="bg-card p-3">
                    <div className="text-xl font-semibold">
                      {stats.total}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Members
                    </div>
                  </div>

                  <div className="bg-card p-3">
                    <div className="text-xl font-semibold">
                      {stats.granted}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Consented
                    </div>
                  </div>

                  <div className="bg-card p-3">
                    <div className="text-xl font-semibold">
                      {stats.eligible}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Eligible
                    </div>
                  </div>

                  <div className="bg-card p-3">
                    <div className="text-xl font-semibold">
                      {stats.suppressed}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Suppressed
                    </div>
                  </div>
                </div>

                {stats.sample.length ? (
                  <div className="space-y-2 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Sample recipients
                    </div>

                    {stats.sample.map((member) => {
                      const email = normaliseEmail(
                        member.email_address
                      );

                      const consent = marketingConsents.find(
                        (item) =>
                          normaliseEmail(item.address) === email
                      );

                      const suppression =
                        marketingSuppressions.find(
                          (item) =>
                            normaliseEmail(item.address) === email &&
                            item.active
                        );

                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium">
                              {member.display_name ||
                                member.email_address}
                            </div>

                            <div className="truncate text-[11px] text-muted-foreground">
                              {member.email_address}
                            </div>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
                              suppression
                                ? "bg-destructive/10 text-destructive"
                                : consent?.status === "granted"
                                  ? "bg-green-500/10 text-green-700"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {suppression
                              ? "Suppressed"
                              : consent?.status === "granted"
                                ? "Eligible"
                                : "Consent needed"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {stats.total > 0 && stats.eligible === 0 ? (
                  <div className="border-t bg-amber-500/10 px-4 py-3 text-xs">
                    This audience currently has no eligible marketing
                    recipients. Consent must be recorded before campaign
                    preparation.
                  </div>
                ) : null}
              </div>
            );
          })() : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium">Subject override</span>
            <input
              value={campaignForm.subjectOverride}
              onChange={(event) =>
                setCampaignForm((current) => ({
                  ...current,
                  subjectOverride: event.target.value,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Preheader override</span>
            <input
              value={campaignForm.preheaderOverride}
              onChange={(event) =>
                setCampaignForm((current) => ({
                  ...current,
                  preheaderOverride: event.target.value,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Schedule</span>
            <input
              type="datetime-local"
              value={campaignForm.scheduledAt}
              onChange={(event) =>
                setCampaignForm((current) => ({
                  ...current,
                  scheduledAt: event.target.value,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-sm font-medium">
              Campaign Setup
            </div>

            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">
                  Mailbox
                </span>
                <span className="text-right font-medium">
                  {selectedCampaignMailbox
                    ? selectedCampaignMailbox.display_name ||
                      selectedCampaignMailbox.email_address
                    : "Not selected"}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">
                  Template
                </span>
                <span className="text-right font-medium">
                  {selectedTemplate?.name ?? "Not selected"}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">
                  Audience
                </span>
                <span className="text-right font-medium">
                  {selectedCampaignAudience
                    ? `${selectedCampaignAudience.name} · ${getAudienceMemberCount(
                        selectedCampaignAudience.id
                      )} members`
                    : "Not selected"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={campaignForm.requiresApproval}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    requiresApproval: event.target.checked,
                  }))
                }
              />
              Require approval before sending
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={campaignForm.trackOpens}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    trackOpens: event.target.checked,
                  }))
                }
              />
              Track opens
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={campaignForm.trackClicks}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    trackClicks: event.target.checked,
                  }))
                }
              />
              Track clicks
            </label>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
            Nexus will check consent and suppression rules when you prepare the
            campaign. Preparing does not send the campaign.
          </div>

          <button
            type="submit"
            disabled={savingCampaign}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {savingCampaign ? "Creating..." : "Create Campaign"}
          </button>
        </form>
      </div>

      <div className="text-xs text-muted-foreground">
        {totalRecipients} campaign recipient records currently prepared across
        all campaigns.
      </div>
    </div>
  );
}
