import {
  NextRequest,
  NextResponse,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validCoordinate(
  value: number,
  minimum: number,
  maximum: number
) {
  return (
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function numberOrNull(
  value: unknown
) {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

export async function GET(
  request: NextRequest
) {
  const apiKey =
    process.env
      .GOOGLE_WEATHER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Google Weather is not configured.",
        configured:
          false,
      },
      {
        status: 503,
      }
    );
  }

  const latitude =
    Number(
      request.nextUrl.searchParams.get(
        "lat"
      )
    );

  const longitude =
    Number(
      request.nextUrl.searchParams.get(
        "lng"
      )
    );

  if (
    !validCoordinate(
      latitude,
      -90,
      90
    ) ||
    !validCoordinate(
      longitude,
      -180,
      180
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Valid latitude and longitude are required.",
      },
      {
        status: 400,
      }
    );
  }

  const url =
    new URL(
      "https://weather.googleapis.com/v1/currentConditions:lookup"
    );

  url.searchParams.set(
    "key",
    apiKey
  );

  url.searchParams.set(
    "location.latitude",
    String(latitude)
  );

  url.searchParams.set(
    "location.longitude",
    String(longitude)
  );

  url.searchParams.set(
    "unitsSystem",
    "METRIC"
  );

  url.searchParams.set(
    "languageCode",
    "en"
  );

  try {
    const response =
      await fetch(
        url,
        {
          cache:
            "no-store",
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Google Weather API error:",
        data
      );

      return NextResponse.json(
        {
          error:
            "Weather information is temporarily unavailable.",
        },
        {
          status:
            response.status,
        }
      );
    }

    return NextResponse.json(
      {
        currentTime:
          data.currentTime ??
          null,

        daytime:
          data.isDaytime ??
          null,

        condition:
          data.weatherCondition
            ?.description
            ?.text ??
          data.weatherCondition
            ?.type ??
          "Weather",

        conditionType:
          data.weatherCondition
            ?.type ??
          null,

        temperatureC:
          numberOrNull(
            data.temperature
              ?.degrees
          ),

        feelsLikeC:
          numberOrNull(
            data.feelsLikeTemperature
              ?.degrees
          ),

        humidity:
          numberOrNull(
            data.relativeHumidity
          ),

        uvIndex:
          numberOrNull(
            data.uvIndex
          ),

        precipitationChance:
          numberOrNull(
            data.precipitation
              ?.probability
              ?.percent
          ),

        provider:
          "Google Weather",
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=300",
        },
      }
    );
  } catch (error) {
    console.error(
      "Weather request failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to connect to Google Weather.",
      },
      {
        status: 502,
      }
    );
  }
}
