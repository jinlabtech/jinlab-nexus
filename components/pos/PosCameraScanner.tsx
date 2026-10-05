"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Camera,
  CameraOff,
} from "lucide-react";

import {
  BrowserMultiFormatReader,
} from "@zxing/browser";

import {
  Button,
} from "@/components/ui/button";


type Props = {
  disabled?: boolean;
  onCode: (
    code: string
  ) => void;
};


export default function PosCameraScanner({
  disabled = false,
  onCode,
}: Props) {

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );


  const controlsRef =
    useRef<{
      stop:
        () => void;
    } | null>(
      null
    );


  const lastCodeRef =
    useRef("");


  const lastScanAtRef =
    useRef(0);


  const [
    active,
    setActive,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  function stop() {

    controlsRef.current
      ?.stop();

    controlsRef.current =
      null;

    setActive(
      false
    );
  }


  useEffect(
    () => {

      return () => {
        controlsRef.current
          ?.stop();
      };

    },
    []
  );


  async function start() {

    setError("");


    if (
      !navigator.mediaDevices
        ?.getUserMedia
    ) {

      setError(
        "Camera scanning is not available on this device."
      );

      return;
    }


    if (!videoRef.current) {
      return;
    }


    try {

      const reader =
        new BrowserMultiFormatReader();


      setActive(
        true
      );


      const controls =
        await reader
          .decodeFromConstraints(
            {
              audio:
                false,

              video: {
                facingMode: {
                  ideal:
                    "environment",
                },

                width: {
                  ideal:
                    1920,
                },

                height: {
                  ideal:
                    1080,
                },
              },
            },

            videoRef.current,

            (
              result
            ) => {

              if (!result) {
                return;
              }


              const code =
                result
                  .getText()
                  .trim();


              if (!code) {
                return;
              }


              const now =
                Date.now();


              if (
                lastCodeRef.current ===
                  code &&
                now -
                  lastScanAtRef.current <
                  900
              ) {
                return;
              }


              lastCodeRef.current =
                code;

              lastScanAtRef.current =
                now;


              onCode(
                code
              );


              if (
                "vibrate" in
                navigator
              ) {

                navigator.vibrate(
                  45
                );
              }

            }
          );


      controlsRef.current =
        controls;

    } catch (
      caught
    ) {

      setActive(
        false
      );

      setError(
        caught instanceof Error
          ? caught.message
          : "POS camera could not start."
      );
    }
  }


  return (
    <div className="nexus-pos-camera-scanner hidden md:hidden">

      <Button
        type="button"
        variant={
          active
            ? "outline"
            : "default"
        }
        disabled={
          disabled
        }
        onClick={() =>
          active
            ? stop()
            : void start()
        }
        className="w-full"
      >

        {
          active
            ? (
              <CameraOff className="mr-2 size-4" />
            )
            : (
              <Camera className="mr-2 size-4" />
            )
        }

        {
          active
            ? "Stop Camera Scanner"
            : "Use Phone as Scanner"
        }

      </Button>


      <div
        className={
          active
            ? "relative mt-2 overflow-hidden rounded-xl bg-black"
            : "h-0 overflow-hidden"
        }
      >

        <video
          ref={videoRef}
          muted
          playsInline
          className={
            active
              ? "h-[32dvh] min-h-[210px] w-full object-cover"
              : "h-px w-px opacity-0"
          }
        />


        {active && (
          <>
            <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-20 -translate-y-1/2 rounded-xl border-2 border-white/75" />

            <p className="absolute inset-x-0 bottom-2 text-center text-[10px] font-semibold text-white">
              Place barcode inside the frame
            </p>
          </>
        )}

      </div>


      {
        error && (
          <p className="mt-2 text-xs text-destructive">
            {
              error
            }
          </p>
        )
      }

    </div>
  );
}
