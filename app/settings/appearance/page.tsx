"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Check,
  Monitor,
  Moon,
  Palette,
  Sun,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import IconStyleSelector from "@/components/nexus-icons/IconStyleSelector";

import {
  Button,
} from "@/components/ui/button";

import {
  changeNexusTheme,
  type NexusThemeKey,
} from "@/components/theme/NexusThemeProvider";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";


type UiSettings = {
  ok: boolean;
  theme_key:
    NexusThemeKey;
  updated_at: string;
  can_manage: boolean;
};


const themes: {
  key: NexusThemeKey;
  name: string;
  description: string;
  icon: React.ReactNode;
  preview:
    "light" |
    "dark" |
    "system";
}[] = [
  {
    key:
      "jinlab_blue",

    name:
      "JINLAB Blue",

    description:
      "Recommended. Windows-style light workspace with blue buttons, white cards and clean grey surfaces.",

    icon: (
      <Sun className="h-5 w-5" />
    ),

    preview:
      "light",
  },

  {
    key:
      "jinlab_blue_dark",

    name:
      "JINLAB Blue Dark",

    description:
      "Dark business workspace using the same JINLAB blue action colour.",

    icon: (
      <Moon className="h-5 w-5" />
    ),

    preview:
      "dark",
  },

  {
    key: "jinlab_frost",
    name: "JINLAB Frost",
    description: "Bright premium workspace inspired by modern iOS and macOS.",
    icon: <Palette className="h-5 w-5" />,
    preview: "light",
  },

  {
    key: "jinlab_graphite",
    name: "JINLAB Graphite",
    description: "Premium charcoal workspace with crisp JINLAB blue accents.",
    icon: <Moon className="h-5 w-5" />,
    preview: "dark",
  },

  {
    key: "jinlab_glass",
    name: "JINLAB Glass",
    description: "iOS-inspired translucent surfaces, blur and layered depth.",
    icon: <Palette className="h-5 w-5" />,
    preview: "light",
  },

  {
    key:
      "system",

    name:
      "Follow Device",

    description:
      "Uses the computer or phone light/dark preference while keeping JINLAB blue branding.",

    icon: (
      <Monitor className="h-5 w-5" />
    ),

    preview:
      "system",
  },
];


function ThemePreview({
  mode,
}: {
  mode:
    "light" |
    "dark" |
    "system";
}) {

  const dark =
    mode ===
    "dark";


  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        background:
          dark
            ? "#181818"
            : "#f5f7fb",
      }}
    >

      <div
        className="flex h-7 items-center gap-1.5 border-b px-3"
        style={{
          background:
            dark
              ? "#242424"
              : "#ffffff",

          borderColor:
            dark
              ? "#3a3a3a"
              : "#d9e0e9",
        }}
      >

        <span className="h-2 w-2 rounded-full bg-[#0067c0]" />

        <span
          className="h-1.5 w-14 rounded-full"
          style={{
            background:
              dark
                ? "#555"
                : "#d7dde6",
          }}
        />

      </div>


      <div className="grid grid-cols-[52px_1fr]">

        <div
          className="h-24 border-r p-2"
          style={{
            background:
              dark
                ? "#202020"
                : "#f8fafc",

            borderColor:
              dark
                ? "#3a3a3a"
                : "#d9e0e9",
          }}
        >

          <div className="mb-2 h-2 rounded bg-[#0067c0]" />
          <div className="mb-2 h-2 rounded bg-black/10 dark:bg-white/10" />
          <div className="h-2 rounded bg-black/10 dark:bg-white/10" />

        </div>


        <div className="p-3">

          <div
            className="mb-3 h-3 w-24 rounded"
            style={{
              background:
                dark
                  ? "#e4e7eb"
                  : "#253247",
            }}
          />


          <div
            className="rounded-lg border p-3"
            style={{
              background:
                dark
                  ? "#242424"
                  : "#ffffff",

              borderColor:
                dark
                  ? "#3a3a3a"
                  : "#d9e0e9",
            }}
          >

            <div className="mb-2 h-2 w-20 rounded bg-black/10 dark:bg-white/10" />

            <div className="h-5 w-20 rounded bg-[#0067c0]" />

          </div>

        </div>

      </div>

    </div>
  );
}


export default function AppearanceSettingsPage() {

  const router =
    useRouter();


  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();


  const canManage =
    can(
      "settings.appearance.manage"
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );


  const [
    currentTheme,
    setCurrentTheme,
  ] =
    useState<NexusThemeKey>(
      "jinlab_blue"
    );


  const [
    selectedTheme,
    setSelectedTheme,
  ] =
    useState<NexusThemeKey>(
      "jinlab_blue"
    );


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const [
    message,
    setMessage,
  ] =
    useState("");


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  useEffect(
    () => {

      if (
        permissionsLoading
      ) {
        return;
      }


      if (!canManage) {

        setLoading(
          false
        );

        return;
      }


      void loadSettings();

    },
    [
      permissionsLoading,
      canManage,
    ]
  );


  async function loadSettings() {

    try {

      setLoading(
        true
      );

      setErrorMessage(
        ""
      );


      const {
        data: {
          user,
        },
      } =
        await supabase.auth
          .getUser();


      if (!user) {

        router.replace(
          "/login"
        );

        return;
      }


      const {
        data:
          profile,
        error:
          profileError,
      } =
        await supabase
          .from(
            "user_profile"
          )
          .select(
            "company_id"
          )
          .eq(
            "user_id",
            user.id
          )
          .single();


      if (
        profileError ||
        !profile?.company_id
      ) {

        throw new Error(
          "Company profile could not be loaded."
        );
      }


      const [
        companyResult,
        settingsResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "company"
            )
            .select(
              "company_name"
            )
            .eq(
              "id",
              profile.company_id
            )
            .single(),

          supabase.rpc(
            "get_company_ui_settings"
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        settingsResult.error
      ) {
        throw settingsResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      const settings =
        settingsResult.data as UiSettings;


      setCurrentTheme(
        settings.theme_key
      );


      setSelectedTheme(
        settings.theme_key
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Appearance settings could not be loaded."
      );

    } finally {

      setLoading(
        false
      );
    }
  }


  async function saveTheme() {

    try {

      setSaving(
        true
      );

      setMessage(
        ""
      );

      setErrorMessage(
        ""
      );


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "save_company_ui_settings",
          {
            p_theme_key:
              selectedTheme,
          }
        );


      if (error) {
        throw error;
      }


      changeNexusTheme(
        selectedTheme
      );


      setCurrentTheme(
        selectedTheme
      );


      setMessage(
        data?.message ??
        "Nexus appearance updated."
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Appearance could not be saved."
      );

    } finally {

      setSaving(
        false
      );
    }
  }


  async function logout() {

    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  if (
    permissionsLoading ||
    loading
  ) {

    return (
      <DashboardLayout>

        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-6xl p-6">
          <p className="text-sm text-muted-foreground">
            Loading Appearance...
          </p>
        </main>

      </DashboardLayout>
    );
  }


  if (!canManage) {

    return (
      <DashboardLayout>

        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-5xl p-6">

          <div className="rounded-2xl border bg-card p-6">

            <h1 className="text-xl font-bold">
              Appearance Restricted
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Only an Owner or Admin can change the company Nexus theme.
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
        userName="Admin"
        onLogout={
          logout
        }
      />


      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">

        <section className="nexus-live-theme-bar mb-7">
          <div>
            <p className="text-sm font-semibold">
              Live Appearance Preview
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Select a theme below, then apply it instantly.
              Save Theme keeps the selection as the company default.
            </p>
          </div>

          <Button
            type="button"
            onClick={() =>
              changeNexusTheme(
                selectedTheme
              )
            }
          >
            Apply Theme Now
          </Button>
        </section>


        <div className="mb-8">

          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Palette className="h-5 w-5" />
            </div>


            <div>

              <p className="text-sm font-medium text-muted-foreground">
                Company Appearance
              </p>


              <h1 className="mt-1 text-3xl font-bold">
                Theme
              </h1>

            </div>

          </div>


          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Choose the visual style used across Nexus.
            The company theme applies to all modules and users.
          </p>

        </div>


        {
          message && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
              {
                message
              }
            </div>
          )
        }


        {
          errorMessage && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {
                errorMessage
              }
            </div>
          )
        }


        <section className="rounded-2xl border bg-card p-5 sm:p-6">

          <div className="mb-6">

            <h2 className="text-xl font-bold">
              Nexus Theme
            </h2>


            <p className="mt-1 text-sm text-muted-foreground">
              JINLAB Blue remains the brand colour in every supported mode.
            </p>

          </div>


          <div className="grid gap-4 md:grid-cols-3">

            {
              themes.map(
                (
                  theme
                ) => {

                  const selected =
                    selectedTheme ===
                    theme.key;


                  const current =
                    currentTheme ===
                    theme.key;


                  return (
                    <button
                      key={
                        theme.key
                      }
                      type="button"
                      onClick={() =>
                        setSelectedTheme(
                          theme.key
                        )
                      }
                      className={
                        selected
                          ? "rounded-2xl border-2 border-primary bg-primary/5 p-4 text-left"
                          : "rounded-2xl border bg-background p-4 text-left transition hover:border-primary/40"
                      }
                    >

                      <ThemePreview
                        mode={
                          theme.preview
                        }
                      />


                      <div className="mt-4 flex items-start justify-between gap-3">

                        <div className="flex items-start gap-3">

                          <div className="mt-0.5 text-primary">
                            {
                              theme.icon
                            }
                          </div>


                          <div>

                            <p className="font-semibold">
                              {
                                theme.name
                              }
                            </p>


                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {
                                theme.description
                              }
                            </p>

                          </div>

                        </div>


                        {
                          selected && (
                            <div className="rounded-full bg-primary p-1 text-primary-foreground">
                              <Check className="h-3.5 w-3.5" />
                            </div>
                          )
                        }

                      </div>


                      {
                        current && (
                          <p className="mt-4 text-xs font-semibold text-primary">
                            Current company theme
                          </p>
                        )
                      }

                    </button>
                  );
                }
              )
            }

          </div>


          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5">

            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              Blue is reserved for normal actions and selected states.
              Green, amber and red remain semantic colours for
              success, warning and errors only.
            </p>


            <Button
              type="button"
              disabled={
                saving ||
                selectedTheme ===
                  currentTheme
              }
              onClick={() =>
                void saveTheme()
              }
            >
              {
                saving
                  ? "Saving..."
                  : "Save Theme"
              }
            </Button>

          </div>

        </section>



        <section className="mt-8">
          <IconStyleSelector />
        </section>

</main>

    </DashboardLayout>
  );
}
