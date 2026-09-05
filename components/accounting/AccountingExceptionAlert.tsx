"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Button,
} from "@/components/ui/button";

import {
  getAccountingExceptionSummary,
} from "@/lib/services/accountingService";

import type {
  AccountingExceptionSummary,
} from "@/lib/services/accountingService";


export default function AccountingExceptionAlert() {
  const router =
    useRouter();

  const [
    summary,
    setSummary,
  ] =
    useState<
      AccountingExceptionSummary |
      null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);


  useEffect(() => {
    async function load() {
      try {
        const result =
          await getAccountingExceptionSummary();

        setSummary(
          result
        );
      } catch {
        /*
         * The main accounting page already handles
         * accounting access/errors.
         *
         * Do not break the entire dashboard simply
         * because this secondary health widget failed.
         */
      } finally {
        setLoading(
          false
        );
      }
    }

    void load();
  }, []);


  if (loading) {
    return (
      <div className="mb-6 rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Checking accounting health...
        </p>
      </div>
    );
  }


  if (!summary) {
    return null;
  }


  if (
    summary.healthy
  ) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">

        <div>
          <p className="text-sm font-semibold">
            Accounting Health
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            All automatic accounting transactions
            are currently posted successfully.
          </p>
        </div>

        <span className="rounded-full border px-3 py-1 text-xs font-semibold">
          No Exceptions
        </span>

      </div>
    );
  }


  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">

      <div>
        <p className="text-sm font-semibold">
          Accounting Attention Required
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          {summary.open_count}{" "}
          transaction
          {summary.open_count === 1
            ? ""
            : "s"}{" "}
          could not be posted automatically.
        </p>

        {summary.oldest_open_date && (
          <p className="mt-1 text-xs text-muted-foreground">
            Oldest unresolved issue:{" "}
            {new Date(
              `${summary.oldest_open_date}T00:00:00`
            ).toLocaleDateString(
              "en-ZA"
            )}
          </p>
        )}
      </div>


      <Button
        type="button"
        className="bg-black text-white hover:bg-black/85"
        onClick={() =>
          router.push(
            "/accounting/exceptions"
          )
        }
      >
        Review Exceptions
      </Button>

    </div>
  );
}
