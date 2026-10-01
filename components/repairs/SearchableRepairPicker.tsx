"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

type RepairPickerOption = {
  id: string;
  label: string;
  detail: string;
  searchText: string;
};

type SearchableRepairPickerProps = {
  label: string;
  labelAction?: ReactNode;
  placeholder: string;
  emptyMessage: string;
  options: RepairPickerOption[];
  value: string;
  onChange: (id: string) => void;
};

export default function SearchableRepairPicker({
  label,
  labelAction,
  placeholder,
  emptyMessage,
  options,
  value,
  onChange,
}: SearchableRepairPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value);
  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((option) => {
      const text = option.searchText.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [options, query]);
  const visibleMatches = matches.slice(0, 8);
  const showResults = !selected || query.trim().length > 0;

  function selectOption(id: string) {
    onChange(id);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="font-medium">{label}</label>
        {labelAction}
      </div>

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-describedby={`${inputId}-help`}
          className="w-full rounded-xl border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        Type to search, then select a matching result below.
      </p>

      {selected && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-700">Selected</p>
            <p className="break-words font-medium">{selected.label}</p>
            <p className="break-words text-xs text-muted-foreground">{selected.detail}</p>
          </div>
          <button
            type="button"
            onClick={() => selectOption("")}
            aria-label={`Clear selected ${selected.label}`}
            className="shrink-0 font-semibold text-blue-700 underline underline-offset-2"
          >
            Clear
          </button>
        </div>
      )}

      {showResults && (
        <div className="space-y-2">
          <p role="status" className="text-xs text-muted-foreground">
            {matches.length === 0
              ? options.length === 0 ? emptyMessage : "No matches. Try another search."
              : `Showing ${visibleMatches.length} of ${matches.length} matches.${matches.length > visibleMatches.length ? " Keep typing to narrow the results." : ""}`}
          </p>
          {visibleMatches.length > 0 && (
            <ul aria-label={`${label.replace(/\s*\*$/, "")} search results`} className="max-h-60 overflow-y-auto rounded-xl border divide-y">
              {visibleMatches.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => selectOption(option.id)}
                    className="w-full px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                  >
                    <span className="block break-words font-medium">{option.label}</span>
                    <span className="block break-words text-xs text-muted-foreground">{option.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
