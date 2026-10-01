"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  supabase,
} from "@/lib/supabase";


type RecycleBinItem = {
  item_type:
    | "email_template"
    | "marketing_campaign"
    | "recurring_campaign"
    | "bulk_email";

  record_id: string;
  item_name: string;
  module_name: string;
  record_status: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
};


function formatDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(
    new Date(value)
  );
}


export default function RecycleBinPage() {
  const router =
    useRouter();

  const [
    items,
    setItems,
  ] =
    useState<
      RecycleBinItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    isOwner,
    setIsOwner,
  ] =
    useState(false);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    moduleFilter,
    setModuleFilter,
  ] =
    useState("all");

  const [
    actionId,
    setActionId,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    notice,
    setNotice,
  ] =
    useState("");


  const loadRecycleBin =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        const {
          data: {
            user,
          },
          error:
            authError,
        } =
          await supabase.auth.getUser();

        if (
          authError ||
          !user
        ) {
          router.replace(
            "/login"
          );

          return;
        }


        const {
          data:
            ownerData,
          error:
            ownerError,
        } =
          await supabase.rpc(
            "current_user_is_owner"
          );

        if (ownerError) {
          setError(
            ownerError.message
          );

          setLoading(false);
          return;
        }


        const owner =
          Boolean(
            ownerData
          );

        setIsOwner(
          owner
        );


        if (!owner) {
          setLoading(false);
          return;
        }


        const {
          data,
          error:
            recycleError,
        } =
          await supabase.rpc(
            "owner_recycle_bin_items"
          );


        if (
          recycleError
        ) {
          setError(
            recycleError.message
          );

          setLoading(false);
          return;
        }


        setItems(
          (
            data ?? []
          ) as RecycleBinItem[]
        );

        setLoading(false);
      },
      [router]
    );


  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        void loadRecycleBin();
      }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    loadRecycleBin,
  ]);


  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }


  const modules =
    useMemo(
      () =>
        Array.from(
          new Set(
            items.map(
              (
                item
              ) =>
                item.module_name
            )
          )
        ).sort(),
      [items]
    );


  const visibleItems =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return items.filter(
          (
            item
          ) => {
            const matchesModule =
              moduleFilter ===
                "all" ||
              item.module_name ===
                moduleFilter;

            const matchesSearch =
              !query ||
              item.item_name
                .toLowerCase()
                .includes(
                  query
                ) ||
              item.module_name
                .toLowerCase()
                .includes(
                  query
                ) ||
              (
                item.deleted_by_name ??
                ""
              )
                .toLowerCase()
                .includes(
                  query
                );

            return (
              matchesModule &&
              matchesSearch
            );
          }
        );
      },
      [
        items,
        search,
        moduleFilter,
      ]
    );


  async function restoreItem(
    item: RecycleBinItem
  ) {
    setActionId(
      item.record_id
    );

    setError("");
    setNotice("");

    const {
      error:
        restoreError,
    } =
      await supabase.rpc(
        "owner_recycle_bin_restore",
        {
          p_item_type:
            item.item_type,
          p_record_id:
            item.record_id,
        }
      );

    if (
      restoreError
    ) {
      setError(
        restoreError.message
      );

      setActionId("");
      return;
    }

    setNotice(
      `${item.item_name} restored successfully.`
    );

    await loadRecycleBin();

    setActionId("");
  }


  async function permanentlyDeleteItem(
    item: RecycleBinItem
  ) {
    if (
      !window.confirm(
        `Permanently delete "${item.item_name}"?\n\nThis cannot be undone. Nexus will block deletion if business or communication history depends on this record.`
      )
    ) {
      return;
    }

    setActionId(
      item.record_id
    );

    setError("");
    setNotice("");

    const {
      error:
        deleteError,
    } =
      await supabase.rpc(
        "owner_recycle_bin_permanent_delete",
        {
          p_item_type:
            item.item_type,
          p_record_id:
            item.record_id,
        }
      );

    if (
      deleteError
    ) {
      setError(
        deleteError.message
      );

      setActionId("");
      return;
    }

    setNotice(
      `${item.item_name} permanently deleted.`
    );

    await loadRecycleBin();

    setActionId("");
  }


  return (
    <DashboardLayout>
      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={logout}
      />

      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/settings"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Settings
            </Link>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              Recycle Bin
            </h1>

            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Deleted Nexus records remain here until
              they are restored or permanently removed.
            </p>
          </div>

          {isOwner ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Owner controlled
            </div>
          ) : null}
        </div>


        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}


        {notice ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            {notice}
          </div>
        ) : null}


        {loading ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            Loading Recycle Bin...
          </div>
        ) : !isOwner ? (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-medium">
              Owner access required
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Only the company owner can manage the
              Nexus Recycle Bin.
            </p>
          </div>
        ) : (
          <>
            <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <input
                value={search}
                onChange={(
                  event
                ) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search deleted items..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />

              <select
                value={
                  moduleFilter
                }
                onChange={(
                  event
                ) =>
                  setModuleFilter(
                    event.target.value
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="all">
                  All modules
                </option>

                {modules.map(
                  (
                    module
                  ) => (
                    <option
                      key={
                        module
                      }
                      value={
                        module
                      }
                    >
                      {module}
                    </option>
                  )
                )}
              </select>
            </section>


            <section className="overflow-hidden rounded-xl border bg-card">

              <div className="border-b px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-medium">
                      Deleted items
                    </h2>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {visibleItems.length} item
                      {visibleItems.length === 1
                        ? ""
                        : "s"}
                    </p>
                  </div>
                </div>
              </div>


              {visibleItems.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="text-lg font-medium">
                    Recycle Bin is empty
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">
                    Deleted Nexus records will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {visibleItems.map(
                    (
                      item
                    ) => (
                      <div
                        key={`${item.item_type}:${item.record_id}`}
                        className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.4fr)_180px_190px_180px_auto] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {item.item_name}
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            Status:{" "}
                            {item.record_status ??
                              "—"}
                          </div>
                        </div>


                        <div>
                          <div className="text-xs text-muted-foreground">
                            Module
                          </div>

                          <div className="mt-1 text-sm">
                            {item.module_name}
                          </div>
                        </div>


                        <div>
                          <div className="text-xs text-muted-foreground">
                            Deleted
                          </div>

                          <div className="mt-1 text-sm">
                            {formatDate(
                              item.deleted_at
                            )}
                          </div>
                        </div>


                        <div>
                          <div className="text-xs text-muted-foreground">
                            Deleted by
                          </div>

                          <div className="mt-1 truncate text-sm">
                            {item.deleted_by_name ||
                              "Unknown user"}
                          </div>
                        </div>


                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <button
                            type="button"
                            disabled={
                              actionId ===
                              item.record_id
                            }
                            onClick={() =>
                              void restoreItem(
                                item
                              )
                            }
                            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                          >
                            Restore
                          </button>

                          <button
                            type="button"
                            disabled={
                              actionId ===
                              item.record_id
                            }
                            onClick={() =>
                              void permanentlyDeleteItem(
                                item
                              )
                            }
                            className="rounded-md border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            Permanent Delete
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>


            <p className="text-xs text-muted-foreground">
              Permanent deletion is protected. Nexus may
              refuse to remove records that are required
              for business, communication, compliance or
              audit history.
            </p>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
