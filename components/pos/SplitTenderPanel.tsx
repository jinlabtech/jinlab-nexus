"use client";

import {
  Plus,
  Split,
  Trash2,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";


export type PosTenderMethod =
  | "cash"
  | "card"
  | "eft"
  | "other";


export type PosTenderDraft = {
  payment_method:
    PosTenderMethod;

  amount: string;

  amount_tendered: string;

  reference: string;
};


function numeric(
  value:
    string |
    number
) {

  const result =
    Number(
      value
    );


  return Number.isFinite(
    result
  )
    ? result
    : 0;
}


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
      maximumFractionDigits: 2,
    }
  ).format(
    numeric(
      value
    )
  );
}


const methods:
  PosTenderMethod[] = [
    "cash",
    "card",
    "eft",
    "other",
  ];


export default function SplitTenderPanel({
  total,
  active,
  enabled,
  tenders,
  onActiveChange,
  onTendersChange,
}: {
  total: number;

  active: boolean;
  enabled: boolean;

  tenders:
    PosTenderDraft[];

  onActiveChange:
    (
      active: boolean
    ) => void;

  onTendersChange:
    (
      tenders:
        PosTenderDraft[]
    ) => void;
}) {

  if (!enabled) {
    return null;
  }


  const applied =
    tenders.reduce(
      (
        sum,
        tender
      ) =>
        sum +
        numeric(
          tender.amount
        ),
      0
    );


  const remaining =
    Math.max(
      total -
        applied,
      0
    );


  const over =
    Math.max(
      applied -
        total,
      0
    );


  const changeDue =
    tenders.reduce(
      (
        sum,
        tender
      ) => {

        if (
          tender.payment_method !==
          "cash"
        ) {
          return sum;
        }


        return (
          sum +
          Math.max(
            numeric(
              tender.amount_tendered
            ) -
              numeric(
                tender.amount
              ),
            0
          )
        );
      },
      0
    );


  function enableSplit() {

    onActiveChange(
      true
    );


    if (
      tenders.length ===
      0
    ) {

      onTendersChange([
        {
          payment_method:
            "cash",

          amount: "",

          amount_tendered:
            "",

          reference: "",
        },

        {
          payment_method:
            "card",

          amount: "",

          amount_tendered:
            "",

          reference: "",
        },
      ]);
    }
  }


  function disableSplit() {

    onActiveChange(
      false
    );

    onTendersChange(
      []
    );
  }


  function updateTender(
    index: number,
    patch:
      Partial<
        PosTenderDraft
      >
  ) {

    onTendersChange(
      tenders.map(
        (
          tender,
          tenderIndex
        ) =>
          tenderIndex ===
            index
            ? {
                ...tender,
                ...patch,
              }
            : tender
      )
    );
  }


  function updateAmount(
    index: number,
    value: string
  ) {

    const tender =
      tenders[index];


    const previous =
      tender.amount;


    const shouldFollow =
      tender.payment_method ===
        "cash" &&
      (
        tender.amount_tendered ===
          "" ||
        tender.amount_tendered ===
          previous
      );


    updateTender(
      index,
      {
        amount:
          value,

        amount_tendered:
          shouldFollow
            ? value
            : tender.amount_tendered,
      }
    );
  }


  function addTender() {

    const used =
      new Set(
        tenders.map(
          (
            tender
          ) =>
            tender.payment_method
        )
      );


    const available =
      methods.find(
        (
          method
        ) =>
          !used.has(
            method
          )
      );


    if (!available) {
      return;
    }


    onTendersChange([
      ...tenders,

      {
        payment_method:
          available,

        amount: "",

        amount_tendered:
          "",

        reference: "",
      },
    ]);
  }


  function removeTender(
    index: number
  ) {

    if (
      tenders.length <=
      2
    ) {
      return;
    }


    onTendersChange(
      tenders.filter(
        (
          _tender,
          tenderIndex
        ) =>
          tenderIndex !==
          index
      )
    );
  }


  function useRemaining(
    index: number
  ) {

    const otherApplied =
      tenders.reduce(
        (
          sum,
          tender,
          tenderIndex
        ) =>
          tenderIndex ===
            index
            ? sum
            : sum +
              numeric(
                tender.amount
              ),
        0
      );


    const value =
      Math.max(
        total -
          otherApplied,
        0
      ).toFixed(
        2
      );


    updateAmount(
      index,
      value
    );
  }


  if (!active) {

    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={
          enableSplit
        }
      >
        <Split className="mr-2 h-4 w-4" />

        Split Payment
      </Button>
    );
  }


  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5">

      <div className="flex items-center justify-between border-b p-4">

        <div>

          <div className="flex items-center gap-2">

            <Split className="h-4 w-4 text-primary" />

            <p className="font-semibold">
              Split Payment
            </p>

          </div>


          <p className="mt-1 text-xs text-muted-foreground">
            Allocate the sale across two or more payment methods.
          </p>

        </div>


        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={
            disableSplit
          }
        >
          Use Single Payment
        </Button>

      </div>


      <div className="space-y-3 p-4">

        {
          tenders.map(
            (
              tender,
              index
            ) => {

              const usedMethods =
                tenders
                  .filter(
                    (
                      _item,
                      tenderIndex
                    ) =>
                      tenderIndex !==
                      index
                  )
                  .map(
                    (
                      item
                    ) =>
                      item.payment_method
                  );


              return (
                <div
                  key={
                    index
                  }
                  className="rounded-xl border bg-card p-3"
                >

                  <div className="grid gap-3">

                    <select
                      value={
                        tender.payment_method
                      }
                      onChange={
                        (
                          event
                        ) => {

                          const method =
                            event.target
                              .value as
                              PosTenderMethod;


                          updateTender(
                            index,
                            {
                              payment_method:
                                method,

                              amount_tendered:
                                method ===
                                  "cash"
                                  ? tender.amount
                                  : "",
                            }
                          );
                        }
                      }
                      className="rounded-lg border bg-background px-3 py-2 text-sm font-semibold"
                    >

                      {
                        methods.map(
                          (
                            method
                          ) => (
                            <option
                              key={
                                method
                              }
                              value={
                                method
                              }
                              disabled={
                                usedMethods.includes(
                                  method
                                )
                              }
                            >
                              {
                                method.toUpperCase()
                              }
                            </option>
                          )
                        )
                      }

                    </select>


                    <div className="grid grid-cols-[1fr_auto] gap-2">

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          tender.amount
                        }
                        onChange={
                          (
                            event
                          ) =>
                            updateAmount(
                              index,
                              event.target.value
                            )
                        }
                        placeholder="Amount"
                        className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                      />


                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          useRemaining(
                            index
                          )
                        }
                      >
                        Remaining
                      </Button>

                    </div>


                    {
                      tenders.length >
                        2 ? (

                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            removeTender(
                              index
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>

                      ) : (
                        <div />
                      )
                    }

                  </div>


                  {
                    tender.payment_method ===
                      "cash" && (

                      <label className="mt-3 block text-xs">

                        <span className="text-muted-foreground">
                          Cash actually handed to cashier
                        </span>


                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            tender.amount_tendered
                          }
                          onChange={
                            (
                              event
                            ) =>
                              updateTender(
                                index,
                                {
                                  amount_tendered:
                                    event.target.value,
                                }
                              )
                          }
                          className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                        />

                      </label>
                    )
                  }


                  {
                    tender.payment_method !==
                      "cash" && (

                      <label className="mt-3 block text-xs">

                        <span className="text-muted-foreground">
                          Reference
                        </span>


                        <input
                          value={
                            tender.reference
                          }
                          onChange={
                            (
                              event
                            ) =>
                              updateTender(
                                index,
                                {
                                  reference:
                                    event.target.value,
                                }
                              )
                          }
                          placeholder="Optional reference"
                          className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                        />

                      </label>
                    )
                  }

                </div>
              );
            }
          )
        }


        {
          tenders.length <
            4 && (

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={
                addTender
              }
            >
              <Plus className="mr-2 h-4 w-4" />

              Add Payment Method
            </Button>
          )
        }

      </div>


      <div className="grid gap-3 border-t p-4 sm:grid-cols-4">

        <div>

          <p className="text-xs text-muted-foreground">
            Sale Total
          </p>

          <p className="mt-1 font-bold">
            {
              money(
                total
              )
            }
          </p>

        </div>


        <div>

          <p className="text-xs text-muted-foreground">
            Applied
          </p>

          <p className="mt-1 font-bold">
            {
              money(
                applied
              )
            }
          </p>

        </div>


        <div>

          <p className="text-xs text-muted-foreground">
            Remaining
          </p>

          <p
            className={
              remaining >
                0.009 ||
              over >
                0.009
                ? "mt-1 font-bold text-destructive"
                : "mt-1 font-bold text-primary"
            }
          >
            {
              over >
                0
                ? `Over ${money(
                    over
                  )}`
                : money(
                    remaining
                  )
            }
          </p>

        </div>


        <div>

          <p className="text-xs text-muted-foreground">
            Change
          </p>

          <p className="mt-1 font-bold">
            {
              money(
                changeDue
              )
            }
          </p>

        </div>

      </div>

    </div>
  );
}
