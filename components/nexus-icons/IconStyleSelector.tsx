"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Check,
  Gem,
  Layers3,
  MoonStar,
  Palette,
  Sparkles,
} from "lucide-react";

import {
  NexusIcon,
} from "@/components/nexus-icons/NexusIcon";

import {
  NEXUS_ICON_STYLE_KEY,
  applyNexusIconStyle,
  isNexusIconStyle,
  type NexusIconStyle,
} from "@/components/nexus-icons/NexusAppearanceBoot";


type IconStyleOption = {
  id: NexusIconStyle;
  name: string;
  description: string;
  personality: string;
  badge: string;
};


const styles: IconStyleOption[] = [
  {
    id: "lumina",
    name: "Lumina",
    description:
      "Polished luminous tiles with soft glass reflections and dimensional colour.",
    personality:
      "Signature JINLAB",
    badge:
      "Balanced",
  },
  {
    id: "ceramic",
    name: "Ceramic",
    description:
      "Pearl-like sculpted surfaces with calm shadows and precision glyphs.",
    personality:
      "Soft luxury",
    badge:
      "Elegant",
  },
  {
    id: "titanium",
    name: "Titanium",
    description:
      "Machined dark metal with restrained highlights and professional depth.",
    personality:
      "Industrial",
    badge:
      "Professional",
  },
  {
    id: "aurora",
    name: "Aurora",
    description:
      "Rich spectral light, layered colour and an expressive futuristic finish.",
    personality:
      "Creative",
    badge:
      "Artistic",
  },
  {
    id: "mono",
    name: "Mono",
    description:
      "Minimal monochrome symbols for maximum clarity and reduced visual noise.",
    personality:
      "Focused",
    badge:
      "Minimal",
  },
];


const previewIcons = [
  "dashboard",
  "pos",
  "inventory",
  "security",
];


export default function IconStyleSelector() {
  const [
    selected,
    setSelected,
  ] = useState<NexusIconStyle>(
    "lumina"
  );


  useEffect(() => {
    const stored =
      window.localStorage.getItem(
        NEXUS_ICON_STYLE_KEY
      );

    if (
      isNexusIconStyle(stored)
    ) {
      queueMicrotask(
        () => {
          setSelected(stored);
        }
      );
      return;
    }

    const current =
      document.documentElement.dataset
        .nexusIconStyle ?? null;

    if (
      isNexusIconStyle(
        current
      )
    ) {
      queueMicrotask(
        () => {
          setSelected(current);
        }
      );
    }
  }, []);


  function selectStyle(
    style: NexusIconStyle
  ) {
    setSelected(style);
    applyNexusIconStyle(style);
  }


  return (
    <section className="nexus-icon-settings">
      <div className="nexus-icon-settings__header">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Palette className="h-4 w-4" />
            Nexus Personalisation
          </div>

          <h2 className="text-2xl font-bold tracking-tight">
            Icon Style
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose the visual character of
            Nexus icons. Module identity stays
            consistent while materials,
            reflections and depth change.
          </p>
        </div>

        <div className="nexus-icon-settings__mark">
          <Sparkles className="h-5 w-5" />
        </div>
      </div>


      <div className="nexus-icon-style-grid">
        {
          styles.map(
            (style) => {
              const active =
                selected === style.id;

              return (
                <button
                  type="button"
                  key={style.id}
                  aria-pressed={active}
                  onClick={() =>
                    selectStyle(
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
                    data-preview-icon-style={
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
                          "lumina" && (
                          <Sparkles className="h-4 w-4" />
                        )
                      }

                      {
                        style.id ===
                          "ceramic" && (
                          <Gem className="h-4 w-4" />
                        )
                      }

                      {
                        style.id ===
                          "titanium" && (
                          <Layers3 className="h-4 w-4" />
                        )
                      }

                      {
                        style.id ===
                          "aurora" && (
                          <MoonStar className="h-4 w-4" />
                        )
                      }

                      {
                        style.id ===
                          "mono" && (
                          <Palette className="h-4 w-4" />
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
