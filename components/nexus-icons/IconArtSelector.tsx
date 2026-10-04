"use client";

import {
  Check,
  Gem,
  Layers3,
  Sparkles,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  NexusIcon,
} from "@/components/nexus-icons/NexusIcon";

import {
  NEXUS_ICON_ART_KEY,
  applyNexusIconArtStyle,
  isNexusIconArtStyle,
  type NexusIconArtStyle,
} from "@/components/nexus-icons/NexusAppearanceBoot";


type ArtOption = {
  id: NexusIconArtStyle;
  name: string;
  badge: string;
  description: string;
  personality: string;
};


const artStyles: ArtOption[] = [
  {
    id: "studio",
    name: "Nexus Studio",
    badge: "Signature",
    description:
      "Clean professional application illustrations with simple silhouettes, balanced proportions and restrained dimensional depth.",
    personality:
      "Premium JINLAB",
  },
];


const previewIcons = [
  "whatsapp",
  "invoices",
  "inventory",
  "shipping",
];


export default function IconArtSelector() {
  const [
    selected,
    setSelected,
  ] =
    useState<NexusIconArtStyle>(
      "studio"
    );


  useEffect(() => {
    const stored =
      window.localStorage.getItem(
        NEXUS_ICON_ART_KEY
      );

    if (
      isNexusIconArtStyle(
        stored
      )
    ) {
      queueMicrotask(
        () =>
          setSelected(
            stored
          )
      );

      return;
    }

    const current =
      document.documentElement
        .dataset
        .nexusIconArt ??
      null;

    if (
      isNexusIconArtStyle(
        current
      )
    ) {
      queueMicrotask(
        () =>
          setSelected(
            current
          )
      );
    }
  }, []);


  function select(
    style: NexusIconArtStyle
  ) {
    setSelected(style);

    applyNexusIconArtStyle(
      style
    );
  }


  return (
    <section className="nexus-icon-settings">

      <div className="nexus-icon-settings__header">

        <div>

          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            Nexus Artwork
          </div>

          <h2 className="text-2xl font-bold tracking-tight">
            Icon Artwork
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose how Nexus applications are illustrated.
            Artwork controls form and dimensional character.
            Material is selected separately below.
          </p>

        </div>

        <div className="nexus-icon-settings__mark">
          <Gem className="h-5 w-5" />
        </div>

      </div>


      <div className="nexus-icon-style-grid">

        {
          artStyles.map(
            (
              style
            ) => {

              const active =
                selected ===
                style.id;

              return (
                <button
                  key={
                    style.id
                  }
                  type="button"
                  aria-pressed={
                    active
                  }
                  onClick={() =>
                    select(
                      style.id
                    )
                  }
                  className={[
                    "nexus-icon-style-card",
                    active
                      ? "is-selected"
                      : "",
                  ].join(" ")}
                >

                  <div className="nexus-icon-style-card__top">

                    <span className="nexus-icon-style-card__badge">
                      {
                        style.badge
                      }
                    </span>

                    {
                      active && (
                        <span className="nexus-icon-style-card__check">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )
                    }

                  </div>


                  <div
                    className="nexus-icon-preview"
                    data-preview-icon-art={
                      style.id
                    }
                  >

                    {
                      previewIcons.map(
                        (
                          name
                        ) => (
                          <NexusIcon
                            key={
                              name
                            }
                            name={
                              name
                            }
                            size="md"
                          />
                        )
                      )
                    }

                  </div>


                  <div className="mt-5 text-left">

                    <div className="flex items-center gap-2">

                      {
                        style.id ===
                          "studio"
                          ? (
                            <Sparkles className="h-4 w-4" />
                          )
                          : style.id ===
                              "sculpted"
                            ? (
                              <Gem className="h-4 w-4" />
                            )
                            : (
                              <Layers3 className="h-4 w-4" />
                            )
                      }

                      <h3 className="font-semibold">
                        {
                          style.name
                        }
                      </h3>

                    </div>


                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {
                        style.description
                      }
                    </p>


                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {
                        style.personality
                      }
                    </p>

                  </div>

                </button>
              );
            }
          )
        }

      </div>

    </section>
  );
}
