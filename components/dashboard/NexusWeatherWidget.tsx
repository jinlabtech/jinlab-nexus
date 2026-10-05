"use client";

import {
  CloudSun,
  Droplets,
  LocateFixed,
  RefreshCw,
  SunMedium,
  Umbrella,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

type WeatherData = {
  currentTime:
    | string
    | null;

  daytime:
    | boolean
    | null;

  condition:
    string;

  conditionType:
    | string
    | null;

  temperatureC:
    | number
    | null;

  feelsLikeC:
    | number
    | null;

  humidity:
    | number
    | null;

  uvIndex:
    | number
    | null;

  precipitationChance:
    | number
    | null;

  provider:
    string;
};

type Position = {
  latitude:
    number;

  longitude:
    number;
};

export default function NexusWeatherWidget() {
  const [
    weather,
    setWeather,
  ] =
    useState<WeatherData | null>(
      null
    );

  const [
    position,
    setPosition,
  ] =
    useState<Position | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const loadWeather =
    useCallback(
      async (
        location:
          Position
      ) => {
        setLoading(true);
        setError("");

        try {
          const params =
            new URLSearchParams({
              lat:
                String(
                  location.latitude
                ),

              lng:
                String(
                  location.longitude
                ),
            });

          const response =
            await fetch(
              `/api/weather?${params.toString()}`,
              {
                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                "Unable to load weather."
            );
          }

          setWeather(
            data as WeatherData
          );
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load weather."
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  const requestLocation =
    useCallback(() => {
      if (
        typeof navigator ===
          "undefined" ||
        !navigator.geolocation
      ) {
        setError(
          "Location is not available on this device."
        );

        return;
      }

      setLoading(true);
      setError("");

      navigator.geolocation
        .getCurrentPosition(
          (result) => {
            const next = {
              latitude:
                result.coords
                  .latitude,

              longitude:
                result.coords
                  .longitude,
            };

            setPosition(
              next
            );

            void loadWeather(
              next
            );
          },

          () => {
            setLoading(
              false
            );

            setError(
              "Allow location access to show local weather."
            );
          },

          {
            enableHighAccuracy:
              false,

            timeout:
              8000,

            maximumAge:
              10 * 60 * 1000,
          }
        );
    }, [loadWeather]);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return (
    <article className="nexus-weather-widget rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CloudSun className="size-5" />
          </span>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Local Weather
            </p>

            <h3 className="mt-1 font-semibold">
              Google Weather
            </h3>
          </div>
        </div>

        <button
          type="button"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background transition hover:bg-muted active:scale-95"
          aria-label="Refresh weather"
          disabled={loading}
          onClick={() => {
            if (position) {
              void loadWeather(
                position
              );
            } else {
              requestLocation();
            }
          }}
        >
          {loading ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <LocateFixed className="size-4" />
          )}
        </button>
      </div>

      {weather ? (
        <>
          <div className="mt-5 flex items-end gap-3">
            <strong className="text-4xl font-semibold tracking-tight">
              {weather.temperatureC !==
              null
                ? `${Math.round(
                    weather.temperatureC
                  )}°`
                : "—"}
            </strong>

            <span className="pb-1 text-sm text-muted-foreground">
              {weather.condition}
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {weather.feelsLikeC !==
            null
              ? `Feels like ${Math.round(
                  weather.feelsLikeC
                )}°C`
              : "Current local conditions"}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-background/60 p-3">
              <Droplets className="size-4 text-primary" />
              <strong className="mt-2 block text-sm">
                {weather.humidity !==
                null
                  ? `${Math.round(
                      weather.humidity
                    )}%`
                  : "—"}
              </strong>
              <small className="text-[10px] text-muted-foreground">
                Humidity
              </small>
            </div>

            <div className="rounded-xl border bg-background/60 p-3">
              <Umbrella className="size-4 text-primary" />
              <strong className="mt-2 block text-sm">
                {weather.precipitationChance !==
                null
                  ? `${Math.round(
                      weather.precipitationChance
                    )}%`
                  : "—"}
              </strong>
              <small className="text-[10px] text-muted-foreground">
                Rain
              </small>
            </div>

            <div className="rounded-xl border bg-background/60 p-3">
              <SunMedium className="size-4 text-primary" />
              <strong className="mt-2 block text-sm">
                {weather.uvIndex !==
                null
                  ? weather.uvIndex
                  : "—"}
              </strong>
              <small className="text-[10px] text-muted-foreground">
                UV
              </small>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-medium">
            {loading
              ? "Checking local weather…"
              : "Local weather is ready to connect."}
          </p>

          {error && (
            <p className="mt-2 text-xs text-muted-foreground">
              {error}
            </p>
          )}

          {!loading && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium"
              onClick={
                requestLocation
              }
            >
              <LocateFixed className="size-3.5" />
              Use my location
            </button>
          )}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground">
        Weather data provided by Google Weather.
      </p>
    </article>
  );
}
