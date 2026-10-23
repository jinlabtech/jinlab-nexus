"use client";

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  useCallback,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import { useBrowserStorage } from "@/lib/nexus/browser-storage";

export type NexusWidgetItem = {
  id: string;
  title: string;
  content: ReactNode;
  className?: string;
};

type LayoutEntry = {
  id: string;
  hidden: boolean;
};

type Props = {
  items: NexusWidgetItem[];
  storageKey?: string;
  eyebrow?: string;
  description?: string;
};

export default function NexusWidgetBoard({
  items,
  storageKey = "nexus.dashboard.widget-layout.v1",
  eyebrow = "My Nexus",
  description = "Arrange your live workspace.",
}: Props) {
  const itemIds = items
    .map((item) => item.id)
    .join("|");

  const [editing, setEditing] =
    useState(false);

  const [draggedId, setDraggedId] =
    useState<string | null>(null);

  const defaultLayout = useMemo(() => itemIds.split("|").filter(Boolean).map(id => ({ id, hidden: false })), [itemIds]);
  const decodeLayout = useCallback((raw: string): LayoutEntry[] => {
    const saved: unknown = JSON.parse(raw);
    const ids = itemIds.split("|").filter(Boolean);
    const known = new Set(ids);
    const restored: LayoutEntry[] = Array.isArray(saved)
      ? saved.filter((entry): entry is { id: string; hidden?: unknown } => !!entry && typeof entry === "object" && "id" in entry && typeof entry.id === "string" && known.has(entry.id))
        .map(entry => ({ id: entry.id, hidden: Boolean(entry.hidden) }))
      : [];
    const restoredIds = new Set(restored.map(entry => entry.id));
    return [...restored, ...ids.filter(id => !restoredIds.has(id)).map(id => ({ id, hidden: false }))];
  }, [itemIds]);
  const [layout, setLayout] = useBrowserStorage(storageKey, defaultLayout, decodeLayout);

  const itemMap = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.id,
          item,
        ])
      ),
    [items]
  );

  function move(
    id: string,
    direction: -1 | 1
  ) {
    setLayout((current) => {
      const source =
        current.findIndex(
          (entry) =>
            entry.id === id
        );

      const target =
        source + direction;

      if (
        source < 0 ||
        target < 0 ||
        target >= current.length
      ) {
        return current;
      }

      const next =
        [...current];

      const [selected] =
        next.splice(
          source,
          1
        );

      next.splice(
        target,
        0,
        selected
      );

      return next;
    });
  }

  function toggleHidden(
    id: string
  ) {
    setLayout((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              hidden:
                !entry.hidden,
            }
          : entry
      )
    );
  }

  function reset() {
    setLayout(
      items.map((item) => ({
        id: item.id,
        hidden: false,
      }))
    );
  }

  function drop(
    event:
      DragEvent<HTMLElement>,
    targetId: string
  ) {
    event.preventDefault();

    if (
      !draggedId ||
      draggedId === targetId
    ) {
      setDraggedId(null);
      return;
    }

    setLayout((current) => {
      const source =
        current.findIndex(
          (entry) =>
            entry.id ===
            draggedId
        );

      const target =
        current.findIndex(
          (entry) =>
            entry.id ===
            targetId
        );

      if (
        source < 0 ||
        target < 0
      ) {
        return current;
      }

      const next =
        [...current];

      const [selected] =
        next.splice(
          source,
          1
        );

      next.splice(
        target,
        0,
        selected
      );

      return next;
    });

    setDraggedId(null);
  }

  return (
    <section
      className="nexus-widget-workspace"
      data-editing={
        editing
          ? "true"
          : "false"
      }
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="flex gap-2">
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-semibold"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setEditing(
                (value) =>
                  !value
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-semibold"
          >
            {editing ? (
              <>
                <X className="size-3.5" />
                Done
              </>
            ) : (
              <>
                <SlidersHorizontal className="size-3.5" />
                Edit layout
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {layout.map(
          (
            entry,
            index
          ) => {
            const item =
              itemMap.get(
                entry.id
              );

            if (!item) {
              return null;
            }

            if (
              entry.hidden &&
              !editing
            ) {
              return null;
            }

            return (
              <article
                key={
                  entry.id
                }
                draggable={
                  editing
                }
                onDragStart={() =>
                  setDraggedId(
                    entry.id
                  )
                }
                onDragOver={(
                  event
                ) =>
                  editing &&
                  event.preventDefault()
                }
                onDrop={(
                  event
                ) =>
                  drop(
                    event,
                    entry.id
                  )
                }
                onDragEnd={() =>
                  setDraggedId(
                    null
                  )
                }
                className={`relative min-w-0 rounded-2xl transition ${
                  editing
                    ? "border border-dashed border-primary/30 bg-primary/[0.025] p-2 pt-12"
                    : ""
                } ${
                  draggedId ===
                  entry.id
                    ? "scale-[0.99] opacity-60"
                    : ""
                } ${
                  entry.hidden
                    ? "opacity-40"
                    : ""
                } ${
                  item.className ??
                  ""
                }`}
              >
                {editing && (
                  <div className="absolute inset-x-2 top-2 flex h-8 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <GripVertical className="size-4" />

                      <span className="truncate">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={
                          index === 0
                        }
                        onClick={() =>
                          move(
                            entry.id,
                            -1
                          )
                        }
                        className="flex size-7 items-center justify-center rounded-lg border bg-background disabled:opacity-30"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={
                          index ===
                          layout.length -
                            1
                        }
                        onClick={() =>
                          move(
                            entry.id,
                            1
                          )
                        }
                        className="flex size-7 items-center justify-center rounded-lg border bg-background disabled:opacity-30"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          toggleHidden(
                            entry.id
                          )
                        }
                        className="flex size-7 items-center justify-center rounded-lg border bg-background"
                      >
                        {entry.hidden ? (
                          <EyeOff className="size-3.5" />
                        ) : (
                          <Eye className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {item.content}
              </article>
            );
          }
        )}
      </div>
    </section>
  );
}
