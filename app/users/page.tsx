"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import UserForm from "@/components/UserForm";
import UserInviteForm from "@/components/UserInviteForm";
import { Button } from "@/components/ui/button";

import { usePermissions } from "@/hooks/usePermissions";
import { useUsers } from "@/hooks/useUsers";

import { createAuditLog } from "@/lib/services/auditLogService";
import { updateUserProfile } from "@/lib/services/userService";
import { supabase } from "@/lib/supabase";

import type {
  InviteUserData,
  UpdateUserProfileData,
  UserProfile,
  UserRole,
} from "@/types/userProfile";

function formatCreatedDate(date: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
  }).format(new Date(date));
}

function roleBadgeClass(role: UserRole) {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-700";

    case "admin":
      return "bg-blue-100 text-blue-700";

    case "manager":
      return "bg-cyan-100 text-cyan-700";

    case "technician":
      return "bg-amber-100 text-amber-700";

    case "cashier":
      return "bg-emerald-100 text-emerald-700";

    case "viewer":
      return "bg-slate-100 text-slate-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function UsersPage() {
  const router = useRouter();

  const [currentCompanyId, setCurrentCompanyId] =
    useState("");

  const [currentUserId, setCurrentUserId] =
    useState("");

  const [companyName, setCompanyName] =
    useState("JINLAB");

  const [userName, setUserName] =
    useState("JINLAB Admin");

  const {
    users,
    loading,
    errorMessage: usersError,
    refreshUsers,
  } = useUsers(currentCompanyId);

  const {
    can,
    loading: permissionsLoading,
    errorMessage: permissionsError,
  } = usePermissions();

  const [editingUser, setEditingUser] =
    useState<UserProfile | null>(null);

  const [showInviteForm, setShowInviteForm] =
    useState(false);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [pageError, setPageError] =
    useState("");

  useEffect(() => {
    async function initialisePage() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      setCurrentUserId(user.id);

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("user_profile")
        .select(
          "full_name, company_id"
        )
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        setPageError(
          profileError.message
        );
        return;
      }

      if (profileData?.full_name) {
        setUserName(
          profileData.full_name
        );
      }

      if (!profileData?.company_id) {
        setPageError(
          "Your account is not linked to a company."
        );
        return;
      }

      setCurrentCompanyId(
        profileData.company_id
      );

      const {
        data: companyData,
        error: companyError,
      } = await supabase
        .from("company")
        .select("company_name")
        .eq(
          "id",
          profileData.company_id
        )
        .single();

      if (companyError) {
        setPageError(
          companyError.message
        );
        return;
      }

      if (companyData?.company_name) {
        setCompanyName(
          companyData.company_name
        );
      }
    }

    initialisePage();
  }, [router]);

  function openInviteForm() {
    if (!can("user.invite")) {
      setPageError(
        "You do not have permission to invite users."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setEditingUser(null);
    setShowInviteForm(true);
  }

  function closeInviteForm() {
    setShowInviteForm(false);
  }

  function openEditForm(
    user: UserProfile
  ) {
    if (!can("user.update")) {
      setPageError(
        "You do not have permission to edit users."
      );
      return;
    }

    setMessage("");
    setPageError("");
    setShowInviteForm(false);
    setEditingUser(user);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeEditForm() {
    setEditingUser(null);
  }

  async function inviteUser(
    invitation: InviteUserData
  ) {
    if (!can("user.invite")) {
      throw new Error(
        "You do not have permission to invite users."
      );
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (
      sessionError ||
      !session?.access_token
    ) {
      throw new Error(
        sessionError?.message ??
          "Your session could not be verified."
      );
    }

    const response = await fetch(
      "/api/users/invite",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${session.access_token}`,
        },

        body: JSON.stringify(
          invitation
        ),
      }
    );

    const result =
      (await response.json()) as {
        message?: string;
        error?: string;
      };

    if (!response.ok) {
      throw new Error(
        result.error ??
          "The invitation could not be sent."
      );
    }

    setShowInviteForm(false);

    setMessage(
      result.message ??
        "Invitation sent successfully."
    );

    await refreshUsers();
  }

  async function saveUser(
    profileData: UpdateUserProfileData
  ) {
    if (!can("user.update")) {
      throw new Error(
        "You do not have permission to update users."
      );
    }

    if (
      !editingUser ||
      !currentCompanyId
    ) {
      throw new Error(
        "The selected user or company could not be identified."
      );
    }

    const previousRole =
      editingUser.role;

    const updatedUser =
      await updateUserProfile(
        editingUser.id,
        currentCompanyId,
        profileData
      );

    try {
      await createAuditLog({
        company_id:
          currentCompanyId,

        action: "update",

        module: "users",

        record_id:
          updatedUser.id,

        description:
          `Updated user: ${updatedUser.full_name}`,

        metadata: {
          email:
            updatedUser.email,

          previous_role:
            previousRole,

          new_role:
            updatedUser.role,
        },
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? `The user was updated, but audit logging failed: ${error.message}`
          : "The user was updated, but audit logging failed."
      );
    }

    setEditingUser(null);

    setMessage(
      "User updated successfully."
    );

    await refreshUsers();
  }

  async function logout() {
    await supabase.auth.signOut();

    router.replace("/login");
  }

  const filteredUsers =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return users;
      }

      return users.filter(
        (user) =>
          [
            user.full_name,
            user.email,
            user.role,
          ].some((value) =>
            value
              ?.toLowerCase()
              .includes(search)
          )
      );
    }, [
      users,
      searchTerm,
    ]);

  const rows =
    filteredUsers.map(
      (user) => [
        <div
          key={`${user.id}-identity`}
        >
          <p className="font-semibold">
            {user.full_name}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {user.user_id ===
            currentUserId
              ? "Current user"
              : `ID: ${user.user_id.slice(
                  0,
                  8
                )}`}
          </p>
        </div>,

        user.email || "-",

        <span
          key={`${user.id}-role`}
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${roleBadgeClass(
            user.role
          )}`}
        >
          {user.role
            .charAt(0)
            .toUpperCase() +
            user.role.slice(1)}
        </span>,

        formatCreatedDate(
          user.created_at
        ),

        <div
          key={`${user.id}-actions`}
          className="flex flex-wrap gap-2"
        >
          {can("user.update") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                openEditForm(user)
              }
            >
              Edit
            </Button>
          )}
        </div>,
      ]
    );

  const visibleError =
    pageError ||
    usersError ||
    permissionsError;

  if (
    !permissionsLoading &&
    !can("user.view")
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={companyName}
          userName={userName}
          onLogout={logout}
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            <h1 className="text-xl font-semibold">
              Access denied
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              You do not have
              permission to view the
              Users module.
            </p>
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
        userName={userName}
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Access management
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Users
            </h1>

            <p className="mt-2 text-muted-foreground">
              Manage people and
              permissions belonging
              to {companyName}.
            </p>
          </div>

          {can("user.invite") &&
            !showInviteForm &&
            !editingUser && (
              <Button
                type="button"
                onClick={
                  openInviteForm
                }
              >
                + Invite User
              </Button>
            )}
        </section>

        {message && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {visibleError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {visibleError}
          </div>
        )}

        {permissionsLoading && (
          <div className="mb-6 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Loading permissions...
          </div>
        )}

        {showInviteForm &&
          can(
            "user.invite"
          ) && (
            <div className="mb-8">
              <UserInviteForm
                onInvite={
                  inviteUser
                }
                onCancel={
                  closeInviteForm
                }
              />
            </div>
          )}

        {editingUser &&
          can(
            "user.update"
          ) && (
            <div className="mb-8">
              <UserForm
                user={
                  editingUser
                }
                onSave={
                  saveUser
                }
                onCancel={
                  closeEditForm
                }
              />
            </div>
          )}

        <section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Registered users
            </p>

            <p className="text-sm text-muted-foreground">
              {
                filteredUsers.length
              }{" "}
              result
              {filteredUsers.length ===
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
            placeholder="Search users..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
          />
        </section>

        {loading ||
        permissionsLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading users...
          </div>
        ) : (
          <DataTable
            headers={[
              "User",
              "Email",
              "Role",
              "Created",
              "Actions",
            ]}
            rows={rows}
            emptyMessage="No users match your search."
          />
        )}
      </main>
    </DashboardLayout>
  );
}
