"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import { useBranches } from "@/hooks/useBranches";
import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { supabase } from "@/lib/supabase";

function movementLabel(
  movement: string
) {
  return movement
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default function StockMovementsPage() {
  const router = useRouter();

  const [
    currentCompanyId,
    setCurrentCompanyId,
  ] = useState("");

  const [
    companyName,
    setCompanyName,
  ] = useState("JINLAB");

  const [
    userName,
    setUserName,
  ] = useState("JINLAB Admin");

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    pageError,
    setPageError,
  ] = useState("");

  const {
    items,
    movements,
    loading,
    errorMessage:
      inventoryError,
  } = useInventory(
    currentCompanyId
  );

  const {
    branches,
  } = useBranches(
    currentCompanyId
  );

  const {
    can,
    loading:
      permissionsLoading,
    errorMessage:
      permissionsError,
  } = usePermissions();

  useEffect(() => {
    async function initialisePage() {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        router.replace(
          "/login"
        );
        return;
      }

      const {
        data: profile,
        error,
      } = await supabase
        .from(
          "user_profile"
        )
        .select(
          "full_name, company_id"
        )
        .eq(
          "user_id",
          user.id
        )
        .single();

      if (
        error ||
        !profile
      ) {
        setPageError(
          error?.message ??
            "Profile could not be loaded."
        );
        return;
      }

      setUserName(
        profile.full_name
      );

      if (
        !profile.company_id
      ) {
        setPageError(
          "Your account is not linked to a company."
        );
        return;
      }

      setCurrentCompanyId(
        profile.company_id
      );

      const {
        data: company,
      } = await supabase
        .from("company")
        .select(
          "company_name"
        )
        .eq(
          "id",
          profile.company_id
        )
        .single();

      if (
        company?.company_name
      ) {
        setCompanyName(
          company.company_name
        );
      }
    }

    initialisePage();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const itemMap =
    useMemo(() => {
      return new Map(
        items.map(
          (item) => [
            item.id,
            item.item_name,
          ]
        )
      );
    }, [items]);

  const branchMap =
    useMemo(() => {
      return new Map(
        branches.map(
          (branch) => [
            branch.id,
            branch.branch_name,
          ]
        )
      );
    }, [branches]);

  const filteredMovements =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return movements;
      }

      return movements.filter(
        (movement) =>
          [
            itemMap.get(
              movement.inventory_item_id
            ),
            branchMap.get(
              movement.branch_id
            ),
            movement.movement_type,
            movement.reference,
            movement.notes,
          ].some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(
                  search
                )
          )
      );
    }, [
      movements,
      searchTerm,
      itemMap,
      branchMap,
    ]);

  const rows =
    filteredMovements.map(
      (movement) => [
        itemMap.get(
          movement.inventory_item_id
        ) ?? "-",

        branchMap.get(
          movement.branch_id
        ) ?? "-",

        movementLabel(
          movement.movement_type
        ),

        movement.quantity,

        movement.reference ||
          "-",

        movement.notes ||
          "-",

        new Intl.DateTimeFormat(
          "en-ZA",
          {
            dateStyle:
              "medium",
            timeStyle:
              "short",
          }
        ).format(
          new Date(
            movement.created_at
          )
        ),
      ]
    );

  const visibleError =
    pageError ||
    inventoryError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can("inventory.view")
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName={
            userName
          }
          onLogout={
            logout
          }
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            Access denied.
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={
          companyName
        }
        userName={
          userName
        }
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Inventory control
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Stock Movements
            </h1>

            <p className="mt-2 text-muted-foreground">
              Complete history of
              stock entering and
              leaving branches.
            </p>
          </div>

          <Link
            href="/inventory"
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
          >
            Inventory
          </Link>
        </section>

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {visibleError}
          </div>
        )}

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Movement History
            </p>

            <p className="text-sm text-muted-foreground">
              {filteredMovements.length}{" "}
              transaction
              {filteredMovements.length ===
              1
                ? ""
                : "s"}
            </p>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search movements..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            Loading stock movements...
          </div>
        ) : (
          <DataTable
            headers={[
              "Item",
              "Branch",
              "Movement",
              "Quantity",
              "Reference",
              "Notes",
              "Date",
            ]}
            rows={rows}
            emptyMessage="No stock movements yet."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
