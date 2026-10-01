"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getCompanyBranding,
  type CompanyBranding,
} from "@/lib/services/companyBrandingService";

type CommunicationBrandProfile = {
  id: string;
  display_name: string | null;
  logo_path: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  content_background_color: string;
  text_color: string;
  font_family: string;
  button_radius: number;
  footer_text: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_text: string | null;
  is_default: boolean;
  is_active: boolean;
};

type TemplatePurpose =
  | "transactional"
  | "marketing"
  | "notification"
  | "internal";

type TemplateStatus = "draft" | "active" | "archived";

type TemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  purpose: TemplatePurpose;
  category: string;
  channel: string;
  status: TemplateStatus;
  published_version_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

type TemplateVersion = {
  id: string;
  template_id: string;
  version_no: number;
  subject_template: string | null;
  preheader_template: string | null;
  content_blocks: {
    blocks?: TemplateBlock[];
  };
  design_settings: Record<string, unknown>;
  status: "draft" | "published" | "superseded";
  published_at: string | null;
};

type BlockType =
  | "heading"
  | "text"
  | "button"
  | "image"
  | "divider"
  | "spacer"
  | "shipment_tracking";

type TemplateBlock = {
  id: string;
  type: BlockType;
  text?: string;
  url?: string;
  imageUrl?: string;
  altText?: string;
};

type EditorForm = {
  templateId: string | null;
  versionId: string | null;
  name: string;
  description: string;
  purpose: TemplatePurpose;
  category: string;
  subject: string;
  preheader: string;
  blocks: TemplateBlock[];
};

const imageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const maxImageSize = 10 * 1024 * 1024;

const emptyForm: EditorForm = {
  templateId: null,
  versionId: null,
  name: "",
  description: "",
  purpose: "marketing",
  category: "custom",
  subject: "",
  preheader: "",
  blocks: [
    {
      id: crypto.randomUUID(),
      type: "heading",
      text: "Your headline",
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      text: "Write your message here.",
    },
    {
      id: crypto.randomUUID(),
      type: "button",
      text: "Learn More",
      url: "https://",
    },
  ],
};

function newBlock(type: BlockType): TemplateBlock {
  switch (type) {
    case "heading":
      return {
        id: crypto.randomUUID(),
        type,
        text: "New heading",
      };

    case "text":
      return {
        id: crypto.randomUUID(),
        type,
        text: "Add your message here.",
      };

    case "button":
      return {
        id: crypto.randomUUID(),
        type,
        text: "Click Here",
        url: "https://",
      };

    case "image":
      return {
        id: crypto.randomUUID(),
        type,
        imageUrl: "",
        altText: "Image",
      };

    case "divider":
      return {
        id: crypto.randomUUID(),
        type,
      };

    case "spacer":
      return {
        id: crypto.randomUUID(),
        type,
      };

    case "shipment_tracking":
      return {
        id: crypto.randomUUID(),
        type,
        text: "Track your shipment",
        url: "{{tracking_url}}",
      };
  }
}

export default function EmailTemplateStudio() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);

  const [form, setForm] = useState<EditorForm>(emptyForm);

  const [companyBranding, setCompanyBranding] =
    useState<CompanyBranding | null>(null);

  const [emailBrand, setEmailBrand] =
    useState<CommunicationBrandProfile | null>(null);

  const [companyLogoUrl, setCompanyLogoUrl] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] =
    useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{
    blockId: string;
    message: string;
  } | null>(null);
  const imageInputs = useRef(new Map<string, HTMLInputElement>());
  const activeUpload = useRef<{
    blockId: string;
    templateId: string | null;
    versionId: string | null;
    controller: AbortController;
  } | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [isOwner, setIsOwner] = useState(false);

  const activeTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          !template.deleted_at
      ),
    [templates]
  );

  const activeBrand = useMemo(() => {
    const displayName =
      emailBrand?.display_name?.trim() ||
      companyBranding?.trading_name?.trim() ||
      companyBranding?.company_name ||
      "Company";

    return {
      displayName,
      primaryColor:
        emailBrand?.primary_color ??
        "#0F4C81",
      secondaryColor:
        emailBrand?.secondary_color ??
        "#111827",
      accentColor:
        emailBrand?.accent_color ??
        "#2563EB",
      backgroundColor:
        emailBrand?.background_color ??
        "#F5F7FB",
      contentBackgroundColor:
        emailBrand?.content_background_color ??
        "#FFFFFF",
      textColor:
        emailBrand?.text_color ??
        "#111827",
      fontFamily:
        emailBrand?.font_family ??
        "Arial, Helvetica, sans-serif",
      buttonRadius:
        emailBrand?.button_radius ?? 8,
      footerText:
        emailBrand?.footer_text?.trim() ||
        companyBranding?.document_footer?.trim() ||
        "",
      website:
        emailBrand?.website?.trim() ||
        companyBranding?.website?.trim() ||
        "",
      contactEmail:
        emailBrand?.contact_email?.trim() ||
        companyBranding?.email?.trim() ||
        "",
      contactPhone:
        emailBrand?.contact_phone?.trim() ||
        companyBranding?.phone?.trim() ||
        "",
      address:
        emailBrand?.address_text?.trim() ||
        companyBranding?.physical_address?.trim() ||
        "",
    };
  }, [companyBranding, emailBrand]);

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (template) => template.id === form.templateId
      ) ?? null,
    [templates, form.templateId]
  );

  const selectedDraft = useMemo(() => {
    if (!form.templateId) {
      return null;
    }

    return (
      versions
        .filter(
          (version) =>
            version.template_id === form.templateId &&
            version.status === "draft"
        )
        .sort((a, b) => b.version_no - a.version_no)[0] ?? null
    );
  }, [versions, form.templateId]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      window.location.href = "/login";
      return;
    }

    const { data: ownerData } = await supabase.rpc(
      "current_user_is_owner"
    );

    setIsOwner(Boolean(ownerData));

    const {
      data: rpcCompanyId,
      error: companyIdError,
    } = await supabase.rpc("current_company_id");

    let companyIdData = rpcCompanyId;

    if (companyIdError || !companyIdData) {
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("user_profile")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile?.company_id) {
        setError(
          profileError?.message ??
            "Your Nexus company profile could not be loaded."
        );
        setLoading(false);
        return;
      }

      companyIdData = profile.company_id;
    }

    const companyId = companyIdData as string;

    try {
      const branding =
        await getCompanyBranding(companyId);

      setCompanyBranding(branding);

      if (branding.logo_path) {
        const { data: logoData } =
          supabase.storage
            .from("company-logos")
            .getPublicUrl(branding.logo_path);

        setCompanyLogoUrl(
          logoData.publicUrl ?? ""
        );
      } else {
        setCompanyLogoUrl("");
      }
    } catch (brandingError) {
      setError(
        brandingError instanceof Error
          ? brandingError.message
          : "Unable to load company branding."
      );
      setLoading(false);
      return;
    }

    const {
      data: brandProfileData,
      error: brandProfileError,
    } = await supabase
      .from("communication_brand_profile")
      .select(
        "id, display_name, logo_path, primary_color, secondary_color, accent_color, background_color, content_background_color, text_color, font_family, button_radius, footer_text, website, contact_email, contact_phone, address_text, is_default, is_active"
      )
      .eq("is_active", true)
      .is("branch_id", null)
      .order("is_default", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (brandProfileError) {
      setError(brandProfileError.message);
      setLoading(false);
      return;
    }

    setEmailBrand(
      (brandProfileData ??
        null) as CommunicationBrandProfile | null
    );

    const { data: templateData, error: templateError } =
      await supabase
        .from("communication_template")
        .select(
          "id, name, description, purpose, category, channel, status, published_version_id, deleted_at, deleted_by, created_at, updated_at"
        )
        .eq("channel", "email")
        .order("updated_at", { ascending: false });

    if (templateError) {
      setError(templateError.message);
      setLoading(false);
      return;
    }

    const { data: versionData, error: versionError } =
      await supabase
        .from("communication_template_version")
        .select(
          "id, template_id, version_no, subject_template, preheader_template, content_blocks, design_settings, status, published_at"
        )
        .order("version_no", { ascending: false });

    if (versionError) {
      setError(versionError.message);
      setLoading(false);
      return;
    }

    setTemplates(
      (templateData ?? []) as TemplateRecord[]
    );

    setVersions(
      (versionData ?? []) as TemplateVersion[]
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTemplates();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTemplates]);

  useEffect(() => {
    return () => {
      activeUpload.current?.controller.abort();
      activeUpload.current = null;
    };
  }, []);

  function startNewTemplate() {
    if (activeUpload.current) {
      return;
    }

    setUploadError(null);
    setForm({
      ...emptyForm,
      blocks: emptyForm.blocks.map((block) => ({
        ...block,
        id: crypto.randomUUID(),
      })),
    });

    setError("");
    setNotice("");
  }

  function editTemplate(template: TemplateRecord) {
    if (activeUpload.current) {
      return;
    }

    setUploadError(null);
    const draft =
      versions
        .filter(
          (version) =>
            version.template_id === template.id &&
            version.status === "draft"
        )
        .sort((a, b) => b.version_no - a.version_no)[0] ??
      versions
        .filter(
          (version) =>
            version.template_id === template.id
        )
        .sort((a, b) => b.version_no - a.version_no)[0] ??
      null;

    setForm({
      templateId: template.id,
      versionId: draft?.id ?? null,
      name: template.name,
      description: template.description ?? "",
      purpose: template.purpose,
      category: template.category,
      subject: draft?.subject_template ?? "",
      preheader: draft?.preheader_template ?? "",
      blocks:
        draft?.content_blocks?.blocks?.length
          ? draft.content_blocks.blocks
          : [],
    });

    setError("");
    setNotice("");
  }

  function addBlock(type: BlockType) {
    setForm((current) => ({
      ...current,
      blocks: [...current.blocks, newBlock(type)],
    }));
  }

  function updateBlock(
    id: string,
    updates: Partial<TemplateBlock>
  ) {
    if (
      activeUpload.current?.blockId === id &&
      updates.imageUrl !== undefined
    ) {
      return;
    }

    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id
          ? { ...block, ...updates }
          : block
      ),
    }));
  }

  function deleteBlock(id: string) {
    if (activeUpload.current?.blockId === id) {
      return;
    }

    setUploadError((current) =>
      current?.blockId === id ? null : current
    );
    setForm((current) => ({
      ...current,
      blocks: current.blocks.filter(
        (block) => block.id !== id
      ),
    }));
  }

  function moveBlock(
    index: number,
    direction: "up" | "down"
  ) {
    setForm((current) => {
      const target =
        direction === "up"
          ? index - 1
          : index + 1;

      if (
        target < 0 ||
        target >= current.blocks.length
      ) {
        return current;
      }

      const blocks = [...current.blocks];

      [blocks[index], blocks[target]] = [
        blocks[target],
        blocks[index],
      ];

      return {
        ...current,
        blocks,
      };
    });
  }

  async function uploadImage(blockId: string, file: File) {
    if (
      activeUpload.current ||
      saving ||
      publishing ||
      !form.blocks.some(
        (block) => block.id === blockId && block.type === "image"
      )
    ) {
      return;
    }

    setUploadError(null);
    setNotice("");

    if (!imageMimeTypes.includes(file.type)) {
      setUploadError({
        blockId,
        message: "Choose a JPEG, PNG, GIF or WebP image.",
      });
      return;
    }

    if (file.size === 0 || file.size > maxImageSize) {
      setUploadError({
        blockId,
        message: "Choose a non-empty image of 10 MB or less.",
      });
      return;
    }

    const upload = {
      blockId,
      templateId: form.templateId,
      versionId: form.versionId,
      controller: new AbortController(),
    };

    activeUpload.current = upload;
    setUploadingBlockId(blockId);

    try {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session?.access_token) {
        throw new Error("Sign in again before uploading an image.");
      }

      if (activeUpload.current !== upload) {
        return;
      }

      const body = new FormData();
      body.append("file", file);

      if (upload.templateId) {
        body.append("templateId", upload.templateId);
      }

      const response = await fetch("/api/email/assets/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body,
        signal: upload.controller.signal,
      });
      const result = (await response.json().catch(() => null)) as {
        publicUrl?: unknown;
        error?: unknown;
      } | null;

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "Unable to upload this image. Please try again."
        );
      }

      const publicUrl = result?.publicUrl;

      if (typeof publicUrl !== "string" || !publicUrl) {
        throw new Error("The upload did not return an image URL.");
      }

      if (activeUpload.current !== upload) {
        return;
      }

      setForm((current) => {
        if (
          current.templateId !== upload.templateId ||
          current.versionId !== upload.versionId
        ) {
          return current;
        }

        return {
          ...current,
          blocks: current.blocks.map((block) =>
            block.id === blockId && block.type === "image"
              ? { ...block, imageUrl: publicUrl }
              : block
          ),
        };
      });
      setNotice("Image uploaded. Save the draft to keep this change.");
    } catch (imageError) {
      if (activeUpload.current === upload) {
        setUploadError({
          blockId,
          message:
            imageError instanceof Error
              ? imageError.message
              : "Unable to upload this image. Please try again.",
        });
      }
    } finally {
      if (activeUpload.current === upload) {
        activeUpload.current = null;
        setUploadingBlockId(null);
      }
    }
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();

    if (activeUpload.current) {
      return;
    }

    if (selectedTemplate?.deleted_at) {
      setError("Restore this template before editing it.");
      return;
    }

    if (!form.name.trim()) {
      setError("Template name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    if (!form.templateId) {
      const { data, error: rpcError } =
        await supabase.rpc(
          "communication_create_template",
          {
            p_name: form.name.trim(),
            p_description:
              form.description.trim() || null,
            p_purpose: form.purpose,
            p_category: form.category,
            p_channel: "email",
            p_branch_id: null,
            p_subject_template:
              form.subject.trim() || null,
            p_preheader_template:
              form.preheader.trim() || null,
            p_content_blocks: {
              blocks: form.blocks,
            },
            p_rendered_html: null,
            p_rendered_text: null,
          }
        );

      if (rpcError) {
        setError(rpcError.message);
        setSaving(false);
        return;
      }

      const result = data as {
        template_id: string;
        version_id: string;
      };

      setForm((current) => ({
        ...current,
        templateId: result.template_id,
        versionId: result.version_id,
      }));

      setNotice("Template created and saved as draft.");
    } else {
      const { data, error: rpcError } =
        await supabase.rpc(
          "communication_save_template_draft",
          {
            p_template_id: form.templateId,
            p_name: form.name.trim(),
            p_description:
              form.description.trim() || null,
            p_branch_id: null,
            p_subject_template:
              form.subject.trim() || null,
            p_preheader_template:
              form.preheader.trim() || null,
            p_content_blocks: {
              blocks: form.blocks,
            },
            p_rendered_html: null,
            p_rendered_text: null,
          }
        );

      if (rpcError) {
        setError(rpcError.message);
        setSaving(false);
        return;
      }

      const result = data as {
        version_id: string;
      };

      setForm((current) => ({
        ...current,
        versionId: result.version_id,
      }));

      setNotice("Draft saved successfully.");
    }

    await loadTemplates();
    setSaving(false);
  }

  async function publishTemplate() {
    if (activeUpload.current) {
      return;
    }

    if (selectedTemplate?.deleted_at) {
      setError("Restore this template before publishing it.");
      return;
    }

    if (!form.templateId || !selectedDraft?.id) {
      setError(
        "Save a draft before publishing this template."
      );
      return;
    }

    setPublishing(true);
    setError("");
    setNotice("");

    const { error: rpcError } =
      await supabase.rpc(
        "communication_publish_template",
        {
          p_template_id: form.templateId,
          p_version_id: selectedDraft.id,
        }
      );

    if (rpcError) {
      setError(rpcError.message);
      setPublishing(false);
      return;
    }

    setNotice("Template published successfully.");

    await loadTemplates();
    setPublishing(false);
  }

  async function archiveTemplate() {
    if (activeUpload.current) {
      return;
    }

    if (!form.templateId) {
      return;
    }

    if (selectedTemplate?.deleted_at) {
      setError("This template is already in Trash.");
      return;
    }

    if (
      !window.confirm(
        "Archive this email template?"
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const { error: rpcError } =
      await supabase.rpc(
        "communication_archive_template",
        {
          p_template_id: form.templateId,
        }
      );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    setNotice("Template archived.");

    await loadTemplates();
    setSaving(false);
  }

  async function trashTemplate() {
    if (!isOwner || !form.templateId) {
      return;
    }

    if (
      !window.confirm(
        "Move this template to Trash? Active recurring campaigns using it will be paused."
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "communication_owner_trash_template",
      {
        p_template_id: form.templateId,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    setForm({
      ...emptyForm,
      blocks: emptyForm.blocks.map(
        (block) => ({
          ...block,
        })
      ),
    });

    setNotice(
      "Template moved to the Nexus Recycle Bin."
    );

    await loadTemplates();
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground">
        Loading Email Template Studio...
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
            Email Template Studio
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Build reusable responsive templates for
            marketing, sales, invoices, repairs and
            shipping communication.
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
            href="/email/marketing"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Marketing
          </Link>

          <button
            type="button"
            onClick={startNewTemplate}
            disabled={Boolean(uploadingBlockId)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            New Template
          </button>
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

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_420px]">
        <aside className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">
                Templates
              </h2>

              {isOwner ? (
                <Link
                  href="/settings/recycle-bin"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Recycle Bin
                </Link>
              ) : null}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {activeTemplates.length} templates
            </p>
          </div>

          <div className="max-h-[720px] space-y-1 overflow-y-auto p-2">
            {activeTemplates.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No templates yet.
              </div>
            ) : (
              activeTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={Boolean(uploadingBlockId)}
                  onClick={() =>
                    editTemplate(template)
                  }
                  className={`w-full rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                    form.templateId === template.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">
                    {template.name}
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{template.category}</span>

                    <span>
                      {template.deleted_at
                        ? "trashed"
                        : template.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <form
          onSubmit={saveTemplate}
          className="space-y-5"
        >
          <section className="rounded-xl border bg-card p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Template name
                </span>

                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Spring promotion"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Category
                </span>

                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="custom">
                    Custom
                  </option>
                  <option value="promotion">
                    Promotion
                  </option>
                  <option value="newsletter">
                    Newsletter
                  </option>
                  <option value="welcome">
                    Welcome
                  </option>
                  <option value="quotation">
                    Quotation
                  </option>
                  <option value="invoice">
                    Invoice
                  </option>
                  <option value="payment_reminder">
                    Payment Reminder
                  </option>
                  <option value="repair_update">
                    Repair Update
                  </option>
                  <option value="order_confirmation">
                    Order Confirmation
                  </option>
                  <option value="shipment_dispatched">
                    Shipment Dispatched
                  </option>
                  <option value="shipment_tracking">
                    Shipment Tracking
                  </option>
                  <option value="delivery_confirmation">
                    Delivery Confirmation
                  </option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Purpose
                </span>

                <select
                  value={form.purpose}
                  disabled={Boolean(form.templateId)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      purpose:
                        event.target
                          .value as TemplatePurpose,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="marketing">
                    Marketing
                  </option>
                  <option value="transactional">
                    Transactional
                  </option>
                  <option value="notification">
                    Notification
                  </option>
                  <option value="internal">
                    Internal
                  </option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Description
                </span>

                <input
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description:
                        event.target.value,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="What this template is used for"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-medium">
              Email details
            </h2>

            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Subject
                </span>

                <input
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Hi {{customer_name}}, your order is on the way"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Preheader
                </span>

                <input
                  value={form.preheader}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      preheader:
                        event.target.value,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Short preview visible in the inbox"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="font-medium">
                Content blocks
              </h2>

              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    "heading",
                    "text",
                    "button",
                    "image",
                    "divider",
                    "spacer",
                    "shipment_tracking",
                  ] as BlockType[]
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      addBlock(type)
                    }
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    +{" "}
                    {type
                      .replaceAll("_", " ")
                      .replace(
                        /\b\w/g,
                        (letter) =>
                          letter.toUpperCase()
                      )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 p-4">
              {form.blocks.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Add your first content block.
                </div>
              ) : null}

              {form.blocks.map(
                (block, index) => (
                  <div
                    key={block.id}
                    className="rounded-lg border bg-background p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium capitalize">
                        {block.type.replaceAll(
                          "_",
                          " "
                        )}
                      </div>

                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            moveBlock(index, "up")
                          }
                          className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          disabled={
                            index ===
                            form.blocks.length - 1
                          }
                          onClick={() =>
                            moveBlock(index, "down")
                          }
                          className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          disabled={uploadingBlockId === block.id}
                          onClick={() =>
                            deleteBlock(block.id)
                          }
                          className="rounded border px-2 py-1 text-xs text-destructive disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {[
                      "heading",
                      "text",
                      "button",
                      "shipment_tracking",
                    ].includes(block.type) ? (
                      <input
                        value={block.text ?? ""}
                        onChange={(event) =>
                          updateBlock(block.id, {
                            text: event.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-card px-3 py-2 text-sm"
                        placeholder="Text"
                      />
                    ) : null}

                    {[
                      "button",
                      "shipment_tracking",
                    ].includes(block.type) ? (
                      <input
                        value={block.url ?? ""}
                        onChange={(event) =>
                          updateBlock(block.id, {
                            url: event.target.value,
                          })
                        }
                        className="mt-2 w-full rounded-md border bg-card px-3 py-2 text-sm"
                        placeholder="https:// or {{tracking_url}}"
                      />
                    ) : null}

                    {block.type === "image" ? (
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={(input) => {
                              if (input) {
                                imageInputs.current.set(block.id, input);
                              } else {
                                imageInputs.current.delete(block.id);
                              }
                            }}
                            type="file"
                            accept={imageMimeTypes.join(",")}
                            aria-label={`Upload image for block ${index + 1}`}
                            disabled={
                              Boolean(uploadingBlockId) || saving || publishing
                            }
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = "";

                              if (file) {
                                void uploadImage(block.id, file);
                              }
                            }}
                            hidden
                          />
                          <button
                            type="button"
                            disabled={
                              Boolean(uploadingBlockId) || saving || publishing
                            }
                            aria-describedby={`image-upload-help-${block.id}`}
                            onClick={() =>
                              imageInputs.current.get(block.id)?.click()
                            }
                            className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                          >
                            {uploadingBlockId === block.id
                              ? "Uploading..."
                              : "Upload Image"}
                          </button>
                          <span
                            id={`image-upload-help-${block.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            JPEG, PNG, GIF or WebP · Up to 10 MB
                          </span>
                        </div>

                        {uploadingBlockId === block.id ? (
                          <p role="status" className="text-xs text-muted-foreground">
                            Uploading image. Please wait before saving or switching templates.
                          </p>
                        ) : null}

                        {uploadError?.blockId === block.id ? (
                          <p role="alert" className="text-xs text-destructive">
                            {uploadError.message}
                          </p>
                        ) : null}

                        <input
                          value={
                            block.imageUrl ?? ""
                          }
                          aria-label="Image URL"
                          disabled={uploadingBlockId === block.id}
                          onChange={(event) =>
                            updateBlock(block.id, {
                              imageUrl:
                                event.target.value,
                            })
                          }
                          className="w-full rounded-md border bg-card px-3 py-2 text-sm"
                          placeholder="Image URL (or upload an image)"
                        />

                        <input
                          value={
                            block.altText ?? ""
                          }
                          aria-label="Alternative text"
                          onChange={(event) =>
                            updateBlock(block.id, {
                              altText:
                                event.target.value,
                            })
                          }
                          className="w-full rounded-md border bg-card px-3 py-2 text-sm"
                          placeholder="Alternative text"
                        />
                      </div>
                    ) : null}
                  </div>
                )
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving || Boolean(uploadingBlockId)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : "Save Draft"}
            </button>

            <button
              type="button"
              disabled={
                publishing ||
                Boolean(uploadingBlockId) ||
                !form.templateId ||
                Boolean(selectedTemplate?.deleted_at)
              }
              onClick={() =>
                void publishTemplate()
              }
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {publishing
                ? "Publishing..."
                : "Publish"}
            </button>

            {selectedTemplate &&
            !selectedTemplate.deleted_at &&
            selectedTemplate.status !==
              "archived" ? (
              <button
                type="button"
                disabled={
                  saving ||
                  Boolean(uploadingBlockId)
                }
                onClick={() =>
                  void archiveTemplate()
                }
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Archive
              </button>
            ) : null}

            {isOwner &&
            selectedTemplate &&
            !selectedTemplate.deleted_at ? (
              <button
                type="button"
                disabled={
                  saving ||
                  Boolean(uploadingBlockId)
                }
                onClick={() =>
                  void trashTemplate()
                }
                className="rounded-md border px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Move to Trash
              </button>
            ) : null}

          </div>
        </form>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b p-4">
              <div className="font-medium">
                Live Preview
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                Desktop email preview
              </div>
            </div>

            <div
              className="p-4"
              style={{
                backgroundColor:
                  activeBrand.backgroundColor,
              }}
            >
              <div
                className="mx-auto max-w-[640px] overflow-hidden rounded-lg shadow-sm"
                style={{
                  backgroundColor:
                    activeBrand.contentBackgroundColor,
                  color: activeBrand.textColor,
                  fontFamily:
                    activeBrand.fontFamily,
                }}
              >
                <div className="border-b px-6 py-5">
                  <div className="flex items-center gap-3">
                    {companyLogoUrl ? (
                      <img
                        src={companyLogoUrl}
                        alt={`${activeBrand.displayName} logo`}
                        className="max-h-12 max-w-[180px] object-contain"
                      />
                    ) : null}

                    <div>
                      <div className="text-lg font-bold">
                        {activeBrand.displayName}
                      </div>

                      {!companyLogoUrl ? (
                        <div className="text-xs text-muted-foreground">
                          Company logo
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-5 px-6 py-6">
                  {form.preheader ? (
                    <div className="text-xs text-muted-foreground">
                      {form.preheader}
                    </div>
                  ) : null}

                  {form.blocks.map(
                    (block) => {
                      if (
                        block.type === "heading"
                      ) {
                        return (
                          <h2
                            key={block.id}
                            className="text-2xl font-semibold"
                          >
                            {block.text}
                          </h2>
                        );
                      }

                      if (
                        block.type === "text"
                      ) {
                        return (
                          <p
                            key={block.id}
                            className="whitespace-pre-wrap text-sm leading-6"
                          >
                            {block.text}
                          </p>
                        );
                      }

                      if (
                        block.type === "button"
                      ) {
                        return (
                          <div key={block.id}>
                            <span
                              className="inline-block px-5 py-3 text-sm font-medium text-white"
                              style={{
                                backgroundColor:
                                  activeBrand.accentColor,
                                borderRadius:
                                  activeBrand.buttonRadius,
                              }}
                            >
                              {block.text ||
                                "Button"}
                            </span>
                          </div>
                        );
                      }

                      if (
                        block.type ===
                        "shipment_tracking"
                      ) {
                        return (
                          <div
                            key={block.id}
                            className="rounded-lg border bg-muted/40 p-4"
                          >
                            <div className="text-sm font-medium">
                              Shipment update
                            </div>

                            <div className="mt-1 text-xs text-muted-foreground">
                              Tracking number:{" "}
                              {
                                "{{tracking_number}}"
                              }
                            </div>

                            <div
                              className="mt-3 inline-block px-4 py-2 text-xs font-medium text-white"
                              style={{
                                backgroundColor:
                                  activeBrand.accentColor,
                                borderRadius:
                                  activeBrand.buttonRadius,
                              }}
                            >
                              {block.text ||
                                "Track shipment"}
                            </div>
                          </div>
                        );
                      }

                      if (
                        block.type === "image"
                      ) {
                        return block.imageUrl ? (
                          <img
                            key={block.id}
                            src={block.imageUrl}
                            alt={
                              block.altText ??
                              ""
                            }
                            className="h-auto w-full rounded-lg"
                          />
                        ) : (
                          <div
                            key={block.id}
                            className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground"
                          >
                            Image
                          </div>
                        );
                      }

                      if (
                        block.type ===
                        "divider"
                      ) {
                        return (
                          <hr
                            key={block.id}
                            className="border-border"
                          />
                        );
                      }

                      if (
                        block.type ===
                        "spacer"
                      ) {
                        return (
                          <div
                            key={block.id}
                            className="h-6"
                          />
                        );
                      }

                      return null;
                    }
                  )}
                </div>

                <div
                  className="border-t px-6 py-5 text-center text-xs"
                  style={{
                    color: activeBrand.textColor,
                  }}
                >
                  {activeBrand.footerText ? (
                    <div className="mb-2">
                      {activeBrand.footerText}
                    </div>
                  ) : null}

                  <div className="space-y-1 opacity-70">
                    {activeBrand.address ? (
                      <div>{activeBrand.address}</div>
                    ) : null}

                    <div>
                      {[
                        activeBrand.contactEmail,
                        activeBrand.contactPhone,
                        activeBrand.website,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>

                    {form.purpose === "marketing" ? (
                      <div className="pt-2">
                        Unsubscribe · Manage preferences
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
