"use client";

import { Children, Fragment, isValidElement, useEffect, useId, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";

type Option = { value: string; label: string; search: string; disabled: boolean };
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string; "data-search"?: string };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue" | "multiple" | "size"> & {
  value?: string | number;
  onValueChange: (value: string) => void;
  searchLabel: string;
};

function text(node: ReactNode): string {
  return Children.toArray(node).map((child) => typeof child === "string" || typeof child === "number" ? String(child) : isValidElement<OptionProps>(child) ? text(child.props.children) : "").join("");
}
function optionsFrom(children: ReactNode, disabled = false): Option[] {
  return Children.toArray(children).flatMap((child): Option[] => {
    if (!isValidElement<OptionProps>(child)) return [];
    if (child.type === Fragment || child.type === "optgroup") return optionsFrom(child.props.children, disabled || Boolean(child.props.disabled));
    if (child.type !== "option") return [];
    const label = (child.props.label || text(child.props.children)).replace(/\s+/g, " ").trim();
    return [{ value: String(child.props.value ?? label), label, search: `${label} ${child.props["data-search"] || ""}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), disabled: disabled || Boolean(child.props.disabled) }];
  });
}

/** Search and choose records inline, preserving the calling form's selection handler. */
export default function SearchableSelect({ children, value, onValueChange, searchLabel, id, name, required, disabled, className, title, "aria-describedby": describedBy, "aria-label": ariaLabel }: Props) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLSpanElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(8);
  const options = useMemo(() => optionsFrom(children), [children]);
  const selected = options.find((option) => option.value === String(value ?? ""));
  const emptyOption = options.find((option) => option.value === "" && !option.disabled);
  const matches = useMemo(() => {
    const terms = query.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    return options.filter((option) => terms.every((term) => option.search.includes(term)));
  }, [options, query]);
  useEffect(() => {
    input.current?.setCustomValidity(required && (!selected || !selected.value || selected.disabled) ? `Select ${searchLabel.toLowerCase()}.` : "");
  }, [required, selected, searchLabel]);

  function choose(option: Option) {
    if (disabled || option.disabled) return;
    onValueChange(option.value);
    setQuery("");
    setLimit(8);
    input.current?.focus();
    setOpen(false);
  }
  function move(direction: number, current?: HTMLButtonElement) {
    const buttons = Array.from(results.current?.querySelectorAll<HTMLButtonElement>("button[data-result]:not(:disabled)") || []);
    const index = current ? buttons.indexOf(current) + direction : direction > 0 ? 0 : buttons.length - 1;
    if (index < 0) input.current?.focus();
    else buttons[Math.min(index, buttons.length - 1)]?.focus();
  }
  return <span className="block min-w-0 space-y-1.5" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <input type="hidden" name={name} value={value ?? ""} disabled={disabled} />
    <input ref={input} id={inputId} type="search" autoComplete="off" value={query} disabled={disabled} title={title}
      aria-label={ariaLabel || `Search ${searchLabel.toLowerCase()}`} aria-describedby={[describedBy, `${inputId}-selected`].filter(Boolean).join(" ")}
      placeholder={`Search ${searchLabel.toLowerCase()}…`} className={className || "h-10 w-full rounded-md border bg-background px-3 text-sm"}
      onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setLimit(8); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && open) { event.preventDefault(); move(1); }
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        if (event.key === "Enter" && open) { event.preventDefault(); const first = matches.find((option) => !option.disabled); if (first) choose(first); }
      }} />
    <span id={`${inputId}-selected`} className="block break-words text-xs text-muted-foreground">{selected ? `Selected: ${selected.label}` : "No selection"}{required ? " · Required" : ""}</span>
    {selected?.value && emptyOption && !disabled && <button type="button" className="text-xs font-medium text-blue-700 underline" aria-label={`Clear selected ${searchLabel.toLowerCase()}`} onClick={(event) => { event.preventDefault(); choose(emptyOption); }}>Clear selection</button>}
    {open && !disabled && <span ref={results} className="block overflow-hidden rounded-md border bg-background shadow-sm">
      <span role="status" className="block px-3 py-2 text-xs text-muted-foreground">{matches.length ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "No matches. Try another search."}</span>
      <span className="block max-h-56 overflow-y-auto">
        {matches.slice(0, limit).map((option) => <button key={option.value} type="button" data-result disabled={option.disabled} aria-pressed={option.value === String(value ?? "")}
          className="block w-full whitespace-normal break-words border-t px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-50"
          onClick={(event) => { event.preventDefault(); choose(option); }} onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1, event.currentTarget); }
            if (event.key === "Escape") { event.preventDefault(); input.current?.focus(); setOpen(false); }
          }}>{option.label}{option.value === String(value ?? "") ? " ✓" : ""}</button>)}
      </span>
      {matches.length > limit && <button type="button" className="w-full border-t px-3 py-2 text-left text-sm font-medium text-blue-700" onClick={(event) => { event.preventDefault(); setLimit((current) => current + 20); }}>Show more results</button>}
    </span>}
  </span>;
}
