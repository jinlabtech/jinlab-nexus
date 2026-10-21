"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

let openDialogs = 0;
let originalOverflow = "";

type ActionModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  className?: string;
  dismissOnBackdrop?: boolean;
};

export default function ActionModal({open,title,subtitle,onClose,children,maxWidth="max-w-3xl",className="",dismissOnBackdrop=true}:ActionModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs++ === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const viewport = window.visualViewport;
    const resize = () => {
      backdrop.current?.style.setProperty("--popup-top", `${viewport?.offsetTop ?? 0}px`);
      backdrop.current?.style.setProperty("--popup-height", `${viewport?.height ?? window.innerHeight}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    panel.current?.focus({preventScroll:true});
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      if (--openDialogs === 0) document.body.style.overflow = originalOverflow;
      if (opener?.isConnected) opener.focus({preventScroll:true});
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={backdrop} className={`nexus-mobile-modal-backdrop nexus-popup-layer fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-3 sm:p-5 ${className}`} role="presentation" onMouseDown={e=>{if(dismissOnBackdrop && e.target===e.currentTarget)close.current()}}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={`nexus-mobile-modal-panel nexus-popup-panel w-full ${maxWidth} rounded-2xl border bg-background shadow-2xl outline-none`}
        onKeyDown={e=>{
          if(e.key==="Escape"){e.stopPropagation();close.current();return;}
          if(e.key!=="Tab")return;
          const targets=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0 && el.getAttribute("aria-hidden")!=="true");
          const first=targets[0],last=targets.at(-1);
          if(!first){e.preventDefault();return;}
          if(e.shiftKey && (document.activeElement===first || document.activeElement===panel.current)){e.preventDefault();last?.focus();}
          else if(!e.shiftKey && (document.activeElement===last || document.activeElement===panel.current)){e.preventDefault();first.focus();}
        }}>
        <div className="nexus-mobile-modal-header flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="min-w-0"><h2 className="text-lg font-semibold">{title}</h2>{subtitle&&<p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full border text-2xl" aria-label={`Close ${title}`}>×</button>
        </div>
        <div className="nexus-mobile-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
      </div>
    </div>, document.body
  );
}
