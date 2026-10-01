"use client";

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222",
  "122213","122312","132212","221213","221312","231212",
  "112232","122132","122231","113222","123122","123221",
  "223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321",
  "112313","132113","132311","211313","231113","231311",
  "112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131",
  "311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124",
  "121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111",
  "241112","134111","111242","121142","121241","114212",
  "124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141",
  "411131","211412","211214","211232","2331112",
];

function encodeCode128B(value: string) {
  const safe = value
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("");

  if (!safe) {
    return {
      modules: [] as Array<{ x: number; width: number }>,
      width: 0,
    };
  }

  const values = safe
    .split("")
    .map((character) => character.charCodeAt(0) - 32);

  let checksum = 104;

  values.forEach((code, index) => {
    checksum += code * (index + 1);
  });

  checksum %= 103;

  const codes = [104, ...values, checksum, 106];

  const modules: Array<{ x: number; width: number }> = [];
  let cursor = 10;

  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code];

    if (!pattern) return;

    pattern.split("").forEach((part, index) => {
      const width = Number(part);

      if (index % 2 === 0) {
        modules.push({
          x: cursor,
          width,
        });
      }

      cursor += width;
    });
  });

  cursor += 10;

  return { modules, width: cursor };
}

type Props = {
  value: string;
  height?: number;
  showText?: boolean;
};

export default function Code128Barcode({
  value,
  height = 42,
  showText = true,
}: Props) {
  const { modules, width } = encodeCode128B(value);

  if (modules.length === 0 || width <= 0) return null;

  const textHeight = showText ? 14 : 0;

  return (
    <svg
      role="img"
      aria-label={`Barcode ${value}`}
      viewBox={`0 0 ${width} ${height + textHeight}`}
      preserveAspectRatio="none"
      className="block h-full w-full"
    >
      <rect width={width} height={height + textHeight} fill="white" />

      {modules.map((module, index) => (
        <rect
          key={`${module.x}-${module.width}-${index}`}
          x={module.x}
          y="0"
          width={module.width}
          height={height}
          fill="black"
        />
      ))}

      {showText && (
        <text
          x={width / 2}
          y={height + 11}
          textAnchor="middle"
          fontSize="9"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fill="black"
        >
          {value}
        </text>
      )}
    </svg>
  );
}
