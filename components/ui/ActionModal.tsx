"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createPortal } from "react-dom";

type ActionModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
};

export default function ActionModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-3xl",
}: ActionModalProps) {
  const [mounted, setMounted] =
    useState(open);

  const [visible, setVisible] =
    useState(false);

  const panelRef =
    useRef<HTMLDivElement | null>(
      null
    );

  useEffect(() => {
    let timer:
      | ReturnType<typeof setTimeout>
      | undefined;

    if (open) {
      setMounted(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);

          panelRef.current?.focus();
        });
      });
    } else {
      setVisible(false);

      timer = setTimeout(() => {
        setMounted(false);
      }, 180);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape" &&
        open
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    mounted,
    open,
    onClose,
  ]);

  if (
    !mounted ||
    typeof document === "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-3 transition-opacity duration-150 sm:p-5 ${
        visible
          ? "opacity-100"
          : "opacity-0"
      }`}
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full ${maxWidth} overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none transition-all duration-200 ease-out ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-[0.985] opacity-0"
        }`}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Quick Action
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xl leading-none transition hover:bg-muted active:scale-95"
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
