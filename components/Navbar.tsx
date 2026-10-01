"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type NavbarProps = {
  companyName: string;

  // Kept temporarily for compatibility with older pages.
  // Navbar now prefers the real authenticated profile.
  userName?: string;

  onLogout: () => void;
};


function niceRole(
  role:
    string |
    null |
    undefined
) {

  if (!role) {
    return "Signed in";
  }


  return role
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter.toUpperCase()
    );
}


export default function Navbar({
  companyName,
  userName,
  onLogout,
}: NavbarProps) {

  const [
    displayName,
    setDisplayName,
  ] =
    useState(
      "JINLAB User"
    );


  const [
    roleLabel,
    setRoleLabel,
  ] =
    useState(
      "Signed in"
    );


  useEffect(
    () => {

      let cancelled =
        false;


      async function loadIdentity() {

        try {

          const {
            data: {
              user,
            },
          } =
            await supabase.auth
              .getUser();


          if (
            cancelled ||
            !user
          ) {
            return;
          }


          const {
            data:
              profile,
            error,
          } =
            await supabase
              .from(
                "user_profile"
              )
              .select(
                "full_name,email,role"
              )
              .eq(
                "user_id",
                user.id
              )
              .single();


          if (
            cancelled
          ) {
            return;
          }


          if (
            error ||
            !profile
          ) {

            setDisplayName(
              userName ||
              user.email ||
              "JINLAB User"
            );

            setRoleLabel(
              "Signed in"
            );

            return;
          }


          setDisplayName(
            profile.full_name ||
            profile.email ||
            user.email ||
            userName ||
            "JINLAB User"
          );


          setRoleLabel(
            niceRole(
              profile.role
            )
          );

        } catch {

          if (
            !cancelled
          ) {

            setDisplayName(
              userName ||
              "JINLAB User"
            );
          }
        }
      }


      void loadIdentity();


      return () => {

        cancelled =
          true;
      };

    },
    [
      userName,
    ]
  );


  return (
    <header className="flex flex-col gap-4 border-b bg-background px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">

      <div>

        <p className="text-sm text-muted-foreground">
          Current company
        </p>


        <h2 className="text-xl font-bold tracking-tight">
          {
            companyName ||
            "Loading company..."
          }
        </h2>

      </div>


      <div className="flex items-center justify-between gap-4 sm:justify-end">

        <div className="text-right">

          <p className="text-sm font-semibold">
            {
              displayName
            }
          </p>


          <p className="text-xs font-medium text-primary">
            {
              roleLabel
            }
          </p>

        </div>


        <Button
          type="button"
          variant="outline"
          onClick={
            onLogout
          }
        >
          Logout
        </Button>

      </div>

    </header>
  );
}
