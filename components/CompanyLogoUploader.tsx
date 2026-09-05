"use client";

import {
  ChangeEvent,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

type Props = {
  logoUrl: string | null;
  uploading: boolean;
  onUpload: (
    file: File
  ) => Promise<void>;
  onRemove: () => Promise<void>;
};

export default function CompanyLogoUploader({
  logoUrl,
  uploading,
  onUpload,
  onRemove,
}: Props) {
  const inputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [
    localPreview,
    setLocalPreview,
  ] =
    useState<string | null>(
      null
    );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const displayedLogo =
    localPreview ||
    logoUrl;

  async function handleFile(
    event:
      ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (
      !allowedTypes.includes(
        file.type
      )
    ) {
      setErrorMessage(
        "Please choose a PNG, JPG or WebP image."
      );
      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      setErrorMessage(
        "Logo must be smaller than 5 MB."
      );
      return;
    }

    setErrorMessage("");

    const preview =
      URL.createObjectURL(
        file
      );

    setLocalPreview(
      preview
    );

    try {
      await onUpload(
        file
      );

      setLocalPreview(
        null
      );
    } catch (error) {
      setLocalPreview(
        null
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Logo could not be uploaded."
      );
    } finally {
      URL.revokeObjectURL(
        preview
      );

      if (
        inputRef.current
      ) {
        inputRef.current.value =
          "";
      }
    }
  }

  async function handleRemove() {
    setErrorMessage("");

    try {
      await onRemove();
      setLocalPreview(
        null
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Logo could not be removed."
      );
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">
          Company Logo
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Used on invoices,
          quotations and other
          company documents.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">

        <div className="flex h-32 w-48 items-center justify-center overflow-hidden rounded-xl border bg-white p-4">

          {displayedLogo ? (
            <img
              src={
                displayedLogo
              }
              alt="Company logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="text-center text-sm text-muted-foreground">
              No logo
              <br />
              uploaded
            </div>
          )}

        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={
              handleFile
            }
            className="hidden"
          />

          <div className="flex flex-wrap gap-2">

            <Button
              type="button"
              onClick={() =>
                inputRef.current?.click()
              }
              disabled={
                uploading
              }
            >
              {uploading
                ? "Uploading..."
                : displayedLogo
                  ? "Replace Logo"
                  : "Upload Logo"}
            </Button>

            {displayedLogo && (
              <Button
                type="button"
                variant="outline"
                disabled={
                  uploading
                }
                onClick={
                  handleRemove
                }
              >
                Remove
              </Button>
            )}

          </div>

          <p className="mt-3 max-w-sm text-xs text-muted-foreground">
            PNG, JPG or WebP.
            Maximum 5 MB.
            Transparent PNG is
            recommended for
            professional documents.
          </p>
        </div>

      </div>

      {errorMessage && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
