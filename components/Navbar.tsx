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

import { getDocumentLogoUrl } from "@/lib/services/settingsService";


type NavbarProps = {
  companyName: string;
  companyLogoUrl?: string | null;

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
  companyLogoUrl,
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


  const [
    resolvedCompanyLogoUrl,
    setResolvedCompanyLogoUrl,
  ] = useState<string | null>(
    companyLogoUrl ?? null
  );


  useEffect(() => {
    let cancelled = false;

    async function loadCompanyLogo() {
      if (companyLogoUrl) {
        setResolvedCompanyLogoUrl(companyLogoUrl);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("user_profile")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.company_id || cancelled) return;

      const { data: branding } = await supabase
        .from("company_document_settings")
        .select("logo_path")
        .eq("company_id", profile.company_id)
        .maybeSingle();

      if (cancelled) return;

      const logoUrl = await getDocumentLogoUrl(
        branding?.logo_path ?? null
      );

      if (!cancelled) {
        setResolvedCompanyLogoUrl(logoUrl);
      }
    }

    void loadCompanyLogo();

    return () => {
      cancelled = true;
    };
  }, [companyLogoUrl]);


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
    <header className="hidden md:flex flex flex-col gap-2 border-b bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-5">

      <div className="flex min-w-0 items-center gap-3 sm:gap-5">

        {resolvedCompanyLogoUrl ? (
          <div
            data-nexus-company-logo-frame="true"
            className="flex h-[58px] w-[94px] shrink-0 items-center justify-center overflow-hidden sm:h-[96px] sm:w-[220px] sm:overflow-visible"
          >

            <img
              src={resolvedCompanyLogoUrl}
              data-nexus-company-logo="true"
              alt={`${companyName || "Company"} logo`}
              className={
                companyName.trim().toUpperCase() === "JINLAB"
                  ? "block h-full w-full object-contain object-center mix-blend-multiply"
                  : "block max-h-[82px] max-w-[210px] object-contain object-left"
              }
            />

          </div>
        ) : (
          <div className="flex h-14 min-w-14 items-center justify-start">
            <span className="text-3xl font-black tracking-tight text-foreground">
              {(companyName || "N")
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase()}
            </span>
          </div>
        )}


        <div className="min-w-0">

          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:text-xs sm:tracking-[0.18em]">
            Current company
          </p>

          <h2 className="truncate text-lg font-bold tracking-tight sm:text-xl">
            {
              companyName ||
              "Loading company..."
            }
          </h2>

        </div>

      </div>


      <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 sm:border-0 sm:pt-0 sm:justify-end sm:gap-4">

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
