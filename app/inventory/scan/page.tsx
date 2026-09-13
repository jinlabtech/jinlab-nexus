"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Barcode,
  Camera,
  CameraOff,
  Search,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  BrowserMultiFormatReader,
} from "@zxing/browser";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


type Branch = {
  id: string;
  name: string;
};


type Workspace = {
  branches:
    Branch[];
};


type ScanResult = {
  ok: boolean;
  message?: string;

  item?: {
    id: string;
    item_name: string;
    sku: string;

    barcode:
      string |
      null;

    selling_price: number;
    cost_price: number;
    minimum_stock: number;
    quantity: number;
  };

  stock_by_branch?: {
    branch_id: string;
    branch_name: string;
    quantity: number;
  }[];
};


function money(
  value:
    number |
    string
) {

  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(
    Number(
      value
    )
  );
}


export default function InventoryScannerPage() {

  const router =
    useRouter();


  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );


  const inputRef =
    useRef<HTMLInputElement | null>(
      null
    );


  const controlsRef =
    useRef<{
      stop:
        () => void;
    } | null>(
      null
    );


  const cameraLockedRef =
    useRef(
      false
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB"
    );


  const [
    userName,
    setUserName,
  ] =
    useState(
      "JINLAB User"
    );


  const [
    branches,
    setBranches,
  ] =
    useState<Branch[]>(
      []
    );


  const [
    branchId,
    setBranchId,
  ] =
    useState(
      ""
    );


  const [
    code,
    setCode,
  ] =
    useState(
      ""
    );


  const [
    result,
    setResult,
  ] =
    useState<ScanResult | null>(
      null
    );


  const [
    cameraActive,
    setCameraActive,
  ] =
    useState(
      false
    );


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState(
      ""
    );


  useEffect(
    () => {

      async function initialise() {

        const {
          data: {
            user,
          },
        } =
          await supabase.auth.getUser();


        if (!user) {

          router.replace(
            "/login"
          );

          return;
        }


        const {
          data:
            profile,
        } =
          await supabase
            .from(
              "user_profile"
            )
            .select(
              "full_name, company_id"
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle();


        if (
          profile?.full_name
        ) {

          setUserName(
            profile.full_name
          );
        }


        if (
          profile?.company_id
        ) {

          const {
            data:
              company,
          } =
            await supabase
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
              .maybeSingle();


          if (
            company?.company_name
          ) {

            setCompanyName(
              company.company_name
            );
          }

        }


        const {
          data,
          error,
        } =
          await supabase.rpc(
            "get_inventory_barcode_workspace",
            {
              p_branch_id:
                null,
            }
          );


        if (error) {

          setErrorMessage(
            error.message
          );

          return;
        }


        const workspace =
          data as Workspace;


        setBranches(
          workspace.branches ??
          []
        );


        if (
          workspace.branches
            ?.length ===
          1
        ) {

          setBranchId(
            workspace
              .branches[
              0
            ].id
          );
        }


        window.setTimeout(
          () =>
            inputRef.current
              ?.focus(),
          50
        );

      }


      void initialise();


      return () => {

        controlsRef.current
          ?.stop();

      };

    },
    []
  );


  async function lookup(
    raw:
      string
  ) {

    const value =
      raw.trim();


    if (!value) {
      return;
    }


    setErrorMessage(
      ""
    );


    const {
      data,
      error,
    } =
      await supabase.rpc(
        "lookup_inventory_barcode",
        {
          p_code:
            value,

          p_branch_id:
            branchId ||
            null,
        }
      );


    if (error) {

      setErrorMessage(
        error.message
      );

      return;
    }


    const next =
      data as ScanResult;


    setResult(
      next
    );


    if (
      !next.ok
    ) {

      setErrorMessage(
        next.message ??
        "Barcode not found."
      );
    }


    setCode(
      ""
    );


    window.setTimeout(
      () =>
        inputRef.current
          ?.focus(),
      50
    );
  }


  function stopCamera() {

    controlsRef.current
      ?.stop();


    controlsRef.current =
      null;


    setCameraActive(
      false
    );
  }


  async function startCamera() {

    setErrorMessage(
      ""
    );


    if (
      !navigator
        .mediaDevices
        ?.getUserMedia
    ) {

      setErrorMessage(
        "Camera scanning is not available in this browser."
      );

      return;
    }


    if (
      !videoRef.current
    ) {
      return;
    }


    try {

      cameraLockedRef.current =
        false;


      const reader =
        new BrowserMultiFormatReader();


      setCameraActive(
        true
      );


      const controls =
        await reader.decodeFromVideoDevice(

          undefined,

          videoRef.current,

          (
            scanResult,
            _error,
            controls
          ) => {

            if (
              !scanResult ||
              cameraLockedRef.current
            ) {
              return;
            }


            cameraLockedRef.current =
              true;


            const scanned =
              scanResult.getText();


            controls.stop();


            controlsRef.current =
              null;


            setCameraActive(
              false
            );


            setCode(
              scanned
            );


            void lookup(
              scanned
            );

          }
        );


      controlsRef.current =
        controls;

    } catch (
      error
    ) {

      setCameraActive(
        false
      );


      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start camera."
      );

    }

  }


  async function logout() {

    stopCamera();

    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }


  return (
    <DashboardLayout>

      <Navbar
        companyName={
          companyName
        }
        userName={
          userName
        }
        onLogout={
          logout
        }
      />


      <main className="p-4 sm:p-6 lg:p-8">

        <div className="mx-auto max-w-4xl">


          <div className="mb-6">

            <div className="flex items-center gap-2">

              <Barcode className="h-6 w-6" />

              <h1 className="text-2xl font-bold">
                Inventory Scanner
              </h1>

            </div>


            <p className="mt-2 text-sm text-muted-foreground">
              Use a USB/Bluetooth scanner,
              type a barcode or use the phone
              camera.
            </p>

          </div>


          {
            errorMessage && (
              <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {
                  errorMessage
                }
              </div>
            )
          }


          <div className="mb-5 rounded-2xl border bg-background p-4">

            <label className="text-sm font-semibold">
              Branch
            </label>


            <select
              value={
                branchId
              }
              onChange={
                (
                  event
                ) =>
                  setBranchId(
                    event.target.value
                  )
              }
              className="mt-2 h-12 w-full rounded-xl border bg-background px-3 text-base"
            >
              <option value="">
                All branches
              </option>


              {
                branches.map(
                  (
                    branch
                  ) => (

                    <option
                      key={
                        branch.id
                      }
                      value={
                        branch.id
                      }
                    >
                      {
                        branch.name
                      }
                    </option>

                  )
                )
              }

            </select>

          </div>


          <div className="mb-5 rounded-2xl border bg-background p-4">

            <label className="text-sm font-semibold">
              Scan barcode or SKU
            </label>


            <div className="mt-2 flex gap-2">

              <div className="relative min-w-0 flex-1">

                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />


                <input
                  ref={
                    inputRef
                  }
                  value={
                    code
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setCode(
                        event.target.value
                      )
                  }
                  onKeyDown={
                    (
                      event
                    ) => {

                      if (
                        event.key ===
                        "Enter"
                      ) {

                        void lookup(
                          code
                        );
                      }
                    }
                  }
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Scan now..."
                  className="h-12 w-full rounded-xl border bg-background pl-11 pr-3 text-base"
                />

              </div>


              <Button
                type="button"
                onClick={() =>
                  void lookup(
                    code
                  )
                }
                className="h-12"
              >
                Find
              </Button>

            </div>

          </div>


          <div className="mb-5 rounded-2xl border bg-background p-4">

            <div className="flex flex-wrap items-center justify-between gap-3">

              <div>

                <p className="font-semibold">
                  iPhone / Mobile Camera
                </p>


                <p className="text-xs text-muted-foreground">
                  Camera access requires a secure
                  HTTPS connection on mobile.
                </p>

              </div>


              {
                cameraActive
                  ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        stopCamera
                      }
                    >
                      <CameraOff className="mr-2 h-4 w-4" />

                      Stop Camera
                    </Button>
                  )
                  : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void startCamera()
                      }
                    >
                      <Camera className="mr-2 h-4 w-4" />

                      Scan with Camera
                    </Button>
                  )
              }

            </div>


            <video
              ref={
                videoRef
              }
              muted
              playsInline
              className={
                `mt-4 w-full rounded-xl bg-black ${
                  cameraActive
                    ? "block"
                    : "hidden"
                }`
              }
            />

          </div>


          {
            result?.ok &&
            result.item && (

              <div className="rounded-2xl border bg-background p-5">

                <p className="text-xs uppercase text-muted-foreground">
                  Product found
                </p>


                <h2 className="mt-2 text-xl font-bold">
                  {
                    result
                      .item
                      .item_name
                  }
                </h2>


                <div className="mt-4 grid gap-4 sm:grid-cols-2">

                  <div>

                    <p className="text-xs text-muted-foreground">
                      SKU
                    </p>

                    <p className="font-semibold">
                      {
                        result
                          .item
                          .sku
                      }
                    </p>

                  </div>


                  <div>

                    <p className="text-xs text-muted-foreground">
                      Barcode
                    </p>

                    <p className="break-all font-mono text-sm">
                      {
                        result
                          .item
                          .barcode ??
                        "Not assigned"
                      }
                    </p>

                  </div>


                  <div>

                    <p className="text-xs text-muted-foreground">
                      Selected stock
                    </p>

                    <p className="text-2xl font-bold">
                      {
                        result
                          .item
                          .quantity
                      }
                    </p>

                  </div>


                  <div>

                    <p className="text-xs text-muted-foreground">
                      Selling price
                    </p>

                    <p className="text-2xl font-bold">
                      {
                        money(
                          result
                            .item
                            .selling_price
                        )
                      }
                    </p>

                  </div>

                </div>


                <div className="mt-5 border-t pt-4">

                  <p className="mb-3 text-sm font-semibold">
                    Stock by branch
                  </p>


                  <div className="space-y-2">

                    {
                      result
                        .stock_by_branch
                        ?.map(
                          (
                            stock
                          ) => (

                            <div
                              key={
                                stock.branch_id
                              }
                              className="flex items-center justify-between rounded-lg border px-3 py-2"
                            >
                              <span>
                                {
                                  stock.branch_name
                                }
                              </span>

                              <span className="font-bold">
                                {
                                  stock.quantity
                                }
                              </span>
                            </div>

                          )
                        )
                    }

                  </div>

                </div>

              </div>

            )
          }

        </div>

      </main>

    </DashboardLayout>
  );
}
