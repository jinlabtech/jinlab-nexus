"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Activity,
  CloudSun,
  MapPin,
} from "lucide-react";


type WeatherState = {
  temperature: number;
  apparent: number;
  code: number;
};


function weatherName(
  code: number
) {
  if (code === 0) {
    return "Clear";
  }

  if (
    code === 1 ||
    code === 2 ||
    code === 3
  ) {
    return "Partly cloudy";
  }

  if (
    code === 45 ||
    code === 48
  ) {
    return "Fog";
  }

  if (
    code >= 51 &&
    code <= 67
  ) {
    return "Rain";
  }

  if (
    code >= 71 &&
    code <= 77
  ) {
    return "Snow";
  }

  if (
    code >= 80 &&
    code <= 82
  ) {
    return "Showers";
  }

  if (
    code >= 95
  ) {
    return "Storm";
  }

  return "Weather";
}


export default function NexusCoreWidgets() {

  const [
    now,
    setNow,
  ] =
    useState<Date | null>(
      null
    );


  const [
    weather,
    setWeather,
  ] =
    useState<WeatherState | null>(
      null
    );


  const [
    weatherState,
    setWeatherState,
  ] =
    useState<
      "idle" |
      "loading" |
      "ready" |
      "blocked" |
      "error"
    >(
      "idle"
    );


  useEffect(
    () => {

      const update =
        () =>
          setNow(
            new Date()
          );


      update();


      const timer =
        window.setInterval(
          update,
          30_000
        );


      return () =>
        window.clearInterval(
          timer
        );

    },
    []
  );


  async function loadWeather() {

    if (
      !navigator.geolocation
    ) {

      setWeatherState(
        "error"
      );

      return;
    }


    setWeatherState(
      "loading"
    );


    navigator.geolocation.getCurrentPosition(

      async (
        position
      ) => {

        try {

          const latitude =
            position.coords.latitude;

          const longitude =
            position.coords.longitude;


          const url =
            new URL(
              "https://api.open-meteo.com/v1/forecast"
            );


          url.searchParams.set(
            "latitude",
            String(
              latitude
            )
          );

          url.searchParams.set(
            "longitude",
            String(
              longitude
            )
          );

          url.searchParams.set(
            "current",
            [
              "temperature_2m",
              "apparent_temperature",
              "weather_code",
            ].join(",")
          );

          url.searchParams.set(
            "timezone",
            "auto"
          );


          const response =
            await fetch(
              url.toString()
            );


          if (!response.ok) {
            throw new Error(
              "Weather unavailable"
            );
          }


          const data =
            await response.json();


          setWeather({
            temperature:
              Number(
                data.current
                  ?.temperature_2m ??
                0
              ),

            apparent:
              Number(
                data.current
                  ?.apparent_temperature ??
                0
              ),

            code:
              Number(
                data.current
                  ?.weather_code ??
                0
              ),
          });


          setWeatherState(
            "ready"
          );

        } catch {

          setWeatherState(
            "error"
          );

        }

      },

      () => {

        setWeatherState(
          "blocked"
        );

      },

      {
        enableHighAccuracy:
          false,

        timeout:
          8_000,

        maximumAge:
          600_000,
      }
    );

  }


  useEffect(
    () => {

      if (
        !navigator.permissions
          ?.query
      ) {
        return;
      }


      void navigator.permissions
        .query({
          name:
            "geolocation",
        })
        .then(
          (
            permission
          ) => {

            if (
              permission.state ===
              "granted"
            ) {
              void loadWeather();
            }

          }
        )
        .catch(
          () => {}
        );

    },
    []
  );


  const time =
    now
      ? new Intl.DateTimeFormat(
          undefined,
          {
            hour:
              "2-digit",

            minute:
              "2-digit",

            hour12:
              false,
          }
        ).format(
          now
        )
      : "--:--";


  const date =
    now
      ? new Intl.DateTimeFormat(
          undefined,
          {
            weekday:
              "short",

            day:
              "numeric",

            month:
              "short",
          }
        ).format(
          now
        )
      : "Loading";


  return (
    <section className="nexus-core-widgets">

      <article className="nexus-core-widget nexus-core-widget-time">

        <span className="nexus-core-widget-kicker">
          Today
        </span>

        <strong className="nexus-core-clock">
          {time}
        </strong>

        <span className="nexus-core-widget-detail">
          {date}
        </span>

      </article>


      <article className="nexus-core-widget">

        <span className="nexus-core-widget-icon">
          <CloudSun />
        </span>


        {
          weather ? (
            <>

              <strong className="nexus-core-widget-value">
                {
                  Math.round(
                    weather.temperature
                  )
                }°
              </strong>

              <span className="nexus-core-widget-detail">
                {
                  weatherName(
                    weather.code
                  )
                }
              </span>

            </>
          ) : (
            <>

              <strong className="nexus-core-widget-value">
                Weather
              </strong>


              <button
                type="button"
                onClick={() =>
                  void loadWeather()
                }
                disabled={
                  weatherState ===
                  "loading"
                }
                className="nexus-core-widget-action"
              >

                <MapPin />

                {
                  weatherState ===
                    "loading"
                    ? "Locating…"
                    : weatherState ===
                        "blocked"
                      ? "Permission"
                      : "Enable"
                }

              </button>

            </>
          )
        }

      </article>


      <article className="nexus-core-widget nexus-core-intelligence-widget">

        <span className="nexus-core-widget-icon">
          <Activity />
        </span>

        <strong className="nexus-core-widget-value">
          Intelligence
        </strong>

        <span className="nexus-core-widget-detail">
          Nexus records live
        </span>

        <span className="nexus-core-live-dot">
          <i />
          Live
        </span>

      </article>

    </section>
  );
}
