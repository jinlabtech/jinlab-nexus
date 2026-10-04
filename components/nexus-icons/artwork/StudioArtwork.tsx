import { Settings } from "lucide-react";
import { siWhatsapp } from "simple-icons";

type Props = {
  name: string;
};

function Art({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className="nexus-studio-art"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function StudioArtwork({
  name,
}: Props) {
  if (name === "settings") {
    return (
      <Settings
        className="nexus-settings-line"
        strokeWidth={1.8}
      />
    );
  }

  if (name === "dashboard") {
    return (
      <Art>
        <rect className="ns-primary" x="8" y="8" width="20" height="20" rx="5" />
        <rect className="ns-primary" x="36" y="8" width="20" height="20" rx="5" />
        <rect className="ns-primary" x="8" y="36" width="20" height="20" rx="5" />
        <rect className="ns-primary" x="36" y="36" width="20" height="20" rx="5" />

        <path className="ns-highlight" d="M11 10h14v5H11Z" />
      </Art>
    );
  }

  if (
    name === "email" ||
    name === "email-sent"
  ) {
    return (
      <Art>

        {/* Rear depth */}
        <rect
          className="ns-shadow"
          x="5"
          y="17"
          width="56"
          height="37"
          rx="5"
        />

        {/* Main envelope */}
        <rect
          className="ns-secondary"
          x="3"
          y="14"
          width="58"
          height="38"
          rx="5"
        />

        {/* Upper blue flap */}
        <path
          className="ns-accent"
          d="M5 18 27.5 35.5c2.7 2.1 6.3 2.1 9 0L59 18v-1c0-1.2-1-2-2.2-2H7.2C6 15 5 15.8 5 17Z"
        />

        {/* Left lower fold */}
        <path
          className="ns-primary"
          d="M5 20v27c0 1 .3 1.8.8 2.5L27 32.5Z"
        />

        {/* Right lower fold */}
        <path
          className="ns-primary"
          d="M59 20v27c0 1-.3 1.8-.8 2.5L37 32.5Z"
        />

        {/* Front lower flap */}
        <path
          className="ns-secondary"
          d="M6 49 27 32.5l2.5 2c1.5 1.2 3.5 1.2 5 0l2.5-2L58 49c-.7 1.3-2 2-4 2H10c-2 0-3.3-.7-4-2Z"
        />

        {/* Crisp fold separation */}
        <path
          d="M5 18 27.5 35.5c2.7 2.1 6.3 2.1 9 0L59 18"
          fill="none"
          stroke="rgba(3,55,105,.30)"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />

        {/* Small controlled highlight */}
        <path
          className="ns-light"
          d="M8 17h30c-9 2-18 5-27 10l-6-5v-3c0-1.2 1-2 3-2Z"
          opacity="0.28"
        />

      </Art>
    );
  }


  if (name === "whatsapp") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="nexus-whatsapp-official"
        aria-hidden="true"
      >
        <path
          d={siWhatsapp.path}
          fill="#25D366"
        />
      </svg>
    );
  }


  if (name === "timebook") {
    return (
      <Art>
        <circle
          className="ns-primary"
          cx="32"
          cy="32"
          r="27"
        />

        <circle
          className="ns-light"
          cx="32"
          cy="32"
          r="20"
        />

        <path
          className="ns-ink"
          d="M30 17h4v16l11 7-3 4-12-8Z"
        />

        <circle
          className="ns-accent"
          cx="32"
          cy="32"
          r="3"
        />
      </Art>
    );
  }

  if (name.startsWith("shipping")) {
    return (
      <svg
        viewBox="0 0 64 64"
        className="nexus-shipping-jinlab"
        aria-hidden="true"
      >
        {/* Ground shadow */}
        <ellipse
          cx="32"
          cy="53"
          rx="28"
          ry="3.5"
          fill="rgba(0,0,0,.16)"
        />

        {/* Main cargo body */}
        <path
          d="M4 17c0-3 2.5-5 5.5-5H39v35H4Z"
          fill="#0B78D0"
        />

        {/* Cargo depth */}
        <path
          d="M4 39h35v8H4Z"
          fill="#075A9E"
        />

        {/* Premium upper highlight */}
        <path
          d="M8 15h28v7H8Z"
          fill="#42A9EE"
          opacity=".72"
        />

        {/* JINLAB vehicle badge */}
        <rect
          x="9"
          y="22"
          width="23"
          height="18"
          rx="4"
          fill="#081B2A"
        />

        {/* Official JINLAB-inspired signature J */}
        <path
          d="M22.5 25.5
             C27 20.5 30 20.7 29.6 24.3
             C29.2 28.2 26 34.2 22.2 37
             C18.8 39.5 15.7 38.3 16 35.4
             C16.3 31.9 20.4 29.1 27.5 27.8"
          fill="none"
          stroke="#77D7D8"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Signature cross stroke */}
        <path
          d="M19 31.6 C22.5 29.3 26 28.4 30.5 27.9"
          fill="none"
          stroke="#77D7D8"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Cab body */}
        <path
          d="M39 25h9c3.5 0 6 1.5 8 4.5L62 39v8H39Z"
          fill="#102C42"
        />

        {/* Cab blue face */}
        <path
          d="M40 27h8c2.6 0 4.2 1.2 5.8 3.7L59 39H40Z"
          fill="#0E6FBA"
        />

        {/* Windscreen */}
        <path
          d="M43 29h6c1.9 0 3 1 4.2 2.8L56 36H43Z"
          fill="#BDEBFF"
        />

        {/* Windscreen reflection */}
        <path
          d="M44 30h5c1.3 0 2.1.5 3 1.5H44Z"
          fill="#FFFFFF"
          opacity=".65"
        />

        {/* Lower cab depth */}
        <path
          d="M40 40h22v7H40Z"
          fill="#08243A"
        />

        {/* Front light */}
        <rect
          x="58"
          y="39"
          width="4"
          height="3"
          rx="1.2"
          fill="#C6F1FF"
        />

        {/* Rear wheel */}
        <circle
          cx="17"
          cy="48"
          r="7.5"
          fill="#111820"
        />
        <circle
          cx="17"
          cy="48"
          r="3.5"
          fill="#AEBCC8"
        />
        <circle
          cx="17"
          cy="48"
          r="1.6"
          fill="#536574"
        />

        {/* Front wheel */}
        <circle
          cx="50"
          cy="48"
          r="7.5"
          fill="#111820"
        />
        <circle
          cx="50"
          cy="48"
          r="3.5"
          fill="#AEBCC8"
        />
        <circle
          cx="50"
          cy="48"
          r="1.6"
          fill="#536574"
        />

        {/* Clean body line */}
        <path
          d="M8 43h28"
          stroke="rgba(255,255,255,.35)"
          strokeWidth="1"
        />
      </svg>
    );
  }


  if (
    name === "pos" ||
    name.startsWith("pos-")
  ) {
    return (
      <Art>
        <rect
          className="ns-secondary"
          x="10"
          y="25"
          width="44"
          height="32"
          rx="5"
        />

        <path
          className="ns-primary"
          d="M9 10h46l5 17H4Z"
        />

        <path
          className="ns-light"
          d="M9 10h10l-3 17H4Zm20 0h10v17H29Zm20 0h6l5 17H49Z"
        />

        <rect
          className="ns-glass"
          x="16"
          y="34"
          width="14"
          height="14"
          rx="2"
        />

        <rect
          className="ns-ink"
          x="38"
          y="34"
          width="10"
          height="23"
          rx="2"
        />
      </Art>
    );
  }

  if (name === "sales") {
    return (
      <svg
        viewBox="0 0 64 64"
        className="nexus-sales-money"
        aria-hidden="true"
      >
        {/* rear banknote */}
        <rect
          x="8"
          y="12"
          width="46"
          height="29"
          rx="5"
          fill="#147A52"
          transform="rotate(-6 31 27)"
        />

        {/* middle banknote */}
        <rect
          x="7"
          y="18"
          width="50"
          height="30"
          rx="5"
          fill="#1D9A66"
          transform="rotate(3 32 33)"
        />

        {/* main banknote */}
        <rect
          x="5"
          y="22"
          width="54"
          height="31"
          rx="6"
          fill="#25B477"
        />

        {/* inner banknote panel */}
        <rect
          x="11"
          y="27"
          width="42"
          height="21"
          rx="4"
          fill="#B8F0D2"
        />

        {/* corner marks */}
        <path
          d="M11 34c4 0 7-3 7-7h-7Z"
          fill="#25B477"
        />

        <path
          d="M53 41c-4 0-7 3-7 7h7Z"
          fill="#25B477"
        />

        {/* centre coin / value mark */}
        <circle
          cx="32"
          cy="37.5"
          r="8"
          fill="#138A59"
        />

        <circle
          cx="32"
          cy="37.5"
          r="5.5"
          fill="#42C98D"
        />

        {/* clean money mark */}
        <path
          d="M29 34.5h4.2c1.8 0 3 1 3 2.5 0 1.6-1.2 2.5-3 2.5H29m3-7v11"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* premium highlight */}
        <path
          d="M12 26h33"
          stroke="rgba(255,255,255,.40)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* depth shadow */}
        <ellipse
          cx="32"
          cy="55"
          rx="23"
          ry="2.5"
          fill="rgba(0,0,0,.14)"
        />
      </svg>
    );
  }


  if (
    name === "customers" ||
    name === "hr" ||
    name === "users"
  ) {
    return (
      <Art>
        <circle
          className="ns-primary"
          cx="25"
          cy="22"
          r="12"
        />

        <path
          className="ns-primary"
          d="M5 58c1-16 8-25 20-25s19 9 20 25Z"
        />

        <circle
          className="ns-secondary"
          cx="45"
          cy="24"
          r="9"
        />

        <path
          className="ns-secondary"
          d="M34 58c1-12 6-19 12-19 7 0 12 7 13 19Z"
        />
      </Art>
    );
  }

  if (
    name === "quotations" ||
    name === "invoices"
  ) {
    return (
      <Art>
        <path
          className="ns-paper"
          d="M14 4h30l10 10v45H14Z"
        />

        <path
          className="ns-primary"
          d="M44 4v12h10Z"
        />

        <rect
          className="ns-secondary"
          x="21"
          y="25"
          width="12"
          height="12"
          rx="3"
        />

        <rect
          className="ns-soft"
          x="37"
          y="26"
          width="10"
          height="4"
          rx="2"
        />

        <rect
          className="ns-soft"
          x="37"
          y="34"
          width="10"
          height="4"
          rx="2"
        />

        <rect
          className="ns-primary"
          x="21"
          y="46"
          width="26"
          height="4"
          rx="2"
        />
      </Art>
    );
  }

  if (name === "repairs") {
    return (
      <svg
        viewBox="0 0 64 64"
        className="nexus-repair-tools"
        aria-hidden="true"
      >

        {/* gear */}
        <g transform="translate(2 2)">
          <path
            d="M30 6
               35 7
               37 12
               42 14
               47 12
               51 16
               49 21
               51 26
               56 28
               56 34
               51 36
               49 41
               51 46
               47 50
               42 48
               37 50
               35 55
               29 56
               27 51
               22 49
               17 51
               13 47
               15 42
               13 37
               8 35
               8 29
               13 27
               15 22
               13 17
               17 13
               22 15
               27 13Z"
            fill="#1886CF"
          />

          <circle
            cx="32"
            cy="31"
            r="12"
            fill="#0D3A59"
          />

          <circle
            cx="32"
            cy="31"
            r="7"
            fill="#BCEBFA"
          />
        </g>


        {/* wrench */}
        <path
          d="M46 8
             C40 7 35 10 33 15
             C32 18 33 21 35 24
             L18 41
             C14 40 10 42 8 46
             C6 50 8 55 12 57
             C16 59 21 57 23 53
             L40 36
             C43 38 47 38 50 36
             C55 33 57 27 54 22
             L47 29
             L41 23
             L48 16
             C49 13 48 10 46 8Z"
          fill="#E6EDF2"
        />

        {/* wrench depth */}
        <path
          d="M18 44 38 24 42 28 22 48Z"
          fill="#AAB9C4"
        />

        {/* handle grip */}
        <circle
          cx="15"
          cy="50"
          r="4"
          fill="#263746"
        />

        <circle
          cx="15"
          cy="50"
          r="2"
          fill="#DCE5EB"
        />

      </svg>
    );
  }


  if (
    name === "inventory" ||
    name.startsWith("inventory-")
  ) {
    return (
      <svg
        viewBox="0 0 64 64"
        className="nexus-inventory-barcode"
        aria-hidden="true"
      >
        <rect x="6"  y="10" width="3" height="44" rx="1" fill="#000000" />
        <rect x="11" y="10" width="6" height="44" rx="1" fill="#000000" />
        <rect x="20" y="10" width="2" height="44" rx="1" fill="#000000" />
        <rect x="24" y="10" width="4" height="44" rx="1" fill="#000000" />
        <rect x="31" y="10" width="7" height="44" rx="1" fill="#000000" />
        <rect x="41" y="10" width="3" height="44" rx="1" fill="#000000" />
        <rect x="47" y="10" width="2" height="44" rx="1" fill="#000000" />
        <rect x="52" y="10" width="6" height="44" rx="1" fill="#000000" />
      </svg>
    );
  }


  if (name === "purchasing") {
    return (
      <Art>
        <path className="ns-primary" d="m7 35 15-8 15 8-15 9Z" />
        <path className="ns-secondary" d="m7 35 15 9v15L7 50Z" />
        <path className="ns-shadow" d="m22 44 15-9v15l-15 9Z" />

        <path className="ns-primary" d="m31 16 13-7 13 7-13 8Z" />
        <path className="ns-secondary" d="m31 16 13 8v14l-13-7Z" />
        <path className="ns-shadow" d="m44 24 13-8v15l-13 7Z" />
      </Art>
    );
  }


  if (name === "accounting") {
    return (
      <Art>
        <rect
          className="ns-primary"
          x="12"
          y="4"
          width="40"
          height="55"
          rx="8"
        />

        <rect
          className="ns-ink"
          x="18"
          y="11"
          width="28"
          height="11"
          rx="3"
        />

        <rect className="ns-light" x="18" y="29" width="7" height="7" rx="2" />
        <rect className="ns-light" x="29" y="29" width="7" height="7" rx="2" />
        <rect className="ns-secondary" x="40" y="29" width="7" height="7" rx="2" />

        <rect className="ns-light" x="18" y="40" width="7" height="7" rx="2" />
        <rect className="ns-light" x="29" y="40" width="7" height="7" rx="2" />
        <rect className="ns-secondary" x="40" y="40" width="7" height="14" rx="2" />

        <rect className="ns-light" x="18" y="51" width="18" height="3" rx="1.5" />
      </Art>
    );
  }

  if (
    name === "finance" ||
    name === "payroll" ||
    name.startsWith("payroll-")
  ) {
    return (
      <Art>
        <rect
          className="ns-primary"
          x="6"
          y="15"
          width="52"
          height="38"
          rx="8"
        />

        <rect
          className="ns-secondary"
          x="29"
          y="25"
          width="31"
          height="19"
          rx="6"
        />

        <circle
          className="ns-light"
          cx="45"
          cy="34"
          r="6"
        />
      </Art>
    );
  }

  if (
    name === "security" ||
    name === "administration"
  ) {
    return (
      <Art>
        <path
          className="ns-primary"
          d="M32 5 55 14v17c0 14-9 24-23 29C18 55 9 45 9 31V14Z"
        />

        <path
          className="ns-secondary"
          d="M32 11v42c11-5 17-13 17-23V18Z"
        />

        <path
          className="ns-light"
          d="m21 31 7 7 15-16 4 4-19 20-11-11Z"
        />
      </Art>
    );
  }

  if (name === "recycle") {
    return (
      <Art>
        <path
          className="ns-primary"
          d="M16 20h32l-3 37H19Z"
        />

        <rect
          className="ns-secondary"
          x="12"
          y="13"
          width="40"
          height="8"
          rx="4"
        />

        <rect
          className="ns-light"
          x="25"
          y="7"
          width="14"
          height="7"
          rx="3.5"
        />
      </Art>
    );
  }

  if (
    name === "core" ||
    name === "ai"
  ) {
    return (
      <svg
        viewBox="0 0 64 64"
        className="nexus-core-signature"
        aria-hidden="true"
      >
        {/* left Nexus pillar */}
        <rect
          x="8"
          y="9"
          width="13"
          height="46"
          rx="6.5"
          fill="#70D7D9"
        />

        {/* connecting intelligence ribbon */}
        <path
          d="M17 17
             C21 14 25 15 28 19
             L47 44
             C50 48 49 53 45 55
             C41 57 37 55 34 51
             L15 26
             C12 22 13 19 17 17Z"
          fill="#168BD5"
        />

        {/* right Nexus pillar */}
        <rect
          x="43"
          y="9"
          width="13"
          height="46"
          rx="6.5"
          fill="#0A5F9D"
        />

        {/* central Nexus node */}
        <circle
          cx="32"
          cy="32"
          r="8"
          fill="#F8FCFF"
        />

        <circle
          cx="32"
          cy="32"
          r="4"
          fill="#102B3C"
        />

        {/* controlled signature highlight */}
        <path
          d="M11 14h7"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".62"
        />

        <path
          d="M46 14h7"
          stroke="#62C6F2"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".72"
        />
      </svg>
    );
  }


  return (
    <Art>
      <path
        className="ns-primary"
        d="m32 4 7 18 19 8-19 8-7 20-7-20-19-8 19-8Z"
      />

      <circle
        className="ns-light"
        cx="32"
        cy="30"
        r="9"
      />

      <circle
        className="ns-secondary"
        cx="32"
        cy="30"
        r="4"
      />
    </Art>
  );
}
