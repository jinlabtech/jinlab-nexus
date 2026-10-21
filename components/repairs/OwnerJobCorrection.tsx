"use client";

import {
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  supabase,
} from "@/lib/supabase";


const fields = {
  device_type: "Device type",
  brand: "Brand",
  model: "Model",
  serial_number: "Serial number",
  imei: "IMEI",
  reported_fault: "Reported fault",
  device_condition: "Device condition",
  accessories_received: "Accessories received",
  diagnosis: "Diagnosis",
  repair_outcome_reason: "Not-repaired reason",
} as const;


type Field =
  keyof typeof fields;


type Values =
  Partial<
    Record<
      Field,
      string | null
    >
  >;


type Draft =
  Partial<
    Record<
      Field,
      string
    >
  >;


type Props = {
  jobId: string;
  updatedAt: string;
  values: Values;
  onSaved: () => Promise<void>;
};


function snapshot(
  values: Values
): Draft {
  return Object.fromEntries(
    (
      Object.keys(
        fields
      ) as Field[]
    ).map(
      (key) => [
        key,
        values[key] ??
          "",
      ]
    )
  ) as Draft;
}


function clean(
  value:
    string | null | undefined
) {
  return (
    value ??
    ""
  ).trim();
}


export default function OwnerJobCorrection({
  jobId,
  updatedAt,
  values,
  onSaved,
}: Props) {
  const [
    draft,
    setDraft,
  ] =
    useState<Draft | null>(
      null
    );

  const [
    original,
    setOriginal,
  ] =
    useState<Draft | null>(
      null
    );

  const [
    openedVersion,
    setOpenedVersion,
  ] =
    useState(
      ""
    );

  const [
    reason,
    setReason,
  ] =
    useState(
      ""
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false
    );


  function begin() {
    const next =
      snapshot(
        values
      );

    setDraft(
      next
    );

    setOriginal(
      next
    );

    setOpenedVersion(
      updatedAt
    );

    setReason(
      ""
    );

    setError(
      ""
    );
  }


  function cancel() {
    if (busy) {
      return;
    }

    setDraft(
      null
    );

    setOriginal(
      null
    );

    setReason(
      ""
    );

    setError(
      ""
    );

    setOpenedVersion(
      ""
    );
  }


  async function save() {
    if (
      !draft ||
      !original
    ) {
      return;
    }


    const changes:
      Record<
        string,
        string
      > = {};


    for (
      const key
      of Object.keys(
        fields
      ) as Field[]
    ) {
      if (
        clean(
          draft[key]
        ) !==
        clean(
          original[key]
        )
      ) {
        changes[key] =
          draft[key] ??
          "";
      }
    }


    if (
      Object.keys(
        changes
      ).length === 0
    ) {
      setError(
        "Change at least one job-card detail before saving."
      );

      return;
    }


    if (
      reason.trim()
        .length < 5
    ) {
      setError(
        "Enter a clear reason for the correction."
      );

      return;
    }


    setBusy(
      true
    );

    setError(
      ""
    );


    try {
      const {
        data:
          current,
        error:
          readError,
      } =
        await supabase
          .from(
            "service_job"
          )
          .select(
            "updated_at, device_type, brand, model, serial_number, imei, reported_fault, device_condition, accessories_received, diagnosis, repair_outcome_reason"
          )
          .eq(
            "id",
            jobId
          )
          .maybeSingle();


      if (
        readError
      ) {
        throw new Error(
          readError.message
        );
      }


      if (
        !current
      ) {
        throw new Error(
          "The job card could not be refreshed."
        );
      }


      const conflicts:
        string[] = [];


      for (
        const key
        of Object.keys(
          changes
        ) as Field[]
      ) {
        if (
          clean(
            current[key] as
              string |
              null
          ) !==
          clean(
            original[key]
          )
        ) {
          conflicts.push(
            fields[key]
          );
        }
      }


      if (
        conflicts.length >
        0
      ) {
        throw new Error(
          `This job changed while the correction was open. Review: ${conflicts.join(
            ", "
          )}. Close and reopen Owner corrections.`
        );
      }


      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "correct_service_job_details",
          {
            p_job_id:
              jobId,

            p_changes:
              changes,

            p_reason:
              reason.trim(),

            p_expected_updated_at:
              current.updated_at ||
              openedVersion,
          }
        );


      if (
        rpcError
      ) {
        throw new Error(
          rpcError.message
        );
      }


      await onSaved();


      setDraft(
        null
      );

      setOriginal(
        null
      );

      setReason(
        ""
      );

      setOpenedVersion(
        ""
      );

    } catch (
      failure
    ) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Correction could not be saved."
      );

    } finally {
      setBusy(
        false
      );
    }
  }


  return (
    <section className="nexus-repair-action-card rounded-2xl border bg-background p-4">

      <h3 className="font-semibold">
        Owner corrections
      </h3>

      <p className="my-2 text-sm text-muted-foreground">
        Correct job-card information without rewriting repair history. Only fields you actually change are saved, and the original values remain in Job Audit.
      </p>


      {!draft ? (

        <Button
          type="button"
          variant="outline"
          onClick={
            begin
          }
        >
          Correct job-card details
        </Button>

      ) : (

        <form
          onSubmit={(
            event
          ) => {
            event.preventDefault();
            void save();
          }}
        >

          <div className="grid gap-3 md:grid-cols-2">

            {(
              Object.entries(
                fields
              ) as [
                Field,
                string,
              ][]
            ).map(
              ([
                key,
                label,
              ]) => (

                <label
                  key={
                    key
                  }
                  className="block space-y-1 text-sm"
                >
                  <span>
                    {label}
                  </span>

                  <textarea
                    disabled={
                      busy
                    }
                    className="w-full rounded-lg border bg-background p-2 text-foreground"
                    value={
                      draft[key] ??
                      ""
                    }
                    onChange={(
                      event
                    ) =>
                      setDraft({
                        ...draft,
                        [key]:
                          event.target.value,
                      })
                    }
                  />
                </label>

              )
            )}

          </div>


          <label className="my-3 block space-y-1 text-sm">

            <span>
              Reason for correction *
            </span>

            <textarea
              required
              minLength={
                5
              }
              disabled={
                busy
              }
              className="w-full rounded-lg border bg-background p-2 text-foreground"
              value={
                reason
              }
              onChange={(
                event
              ) =>
                setReason(
                  event.target.value
                )
              }
              placeholder="What was incorrect and why is it being corrected?"
            />

          </label>


          {error && (
            <p
              role="alert"
              className="my-2 text-sm text-red-600"
            >
              {error}
            </p>
          )}


          <div className="flex flex-wrap gap-2">

            <Button
              type="submit"
              disabled={
                busy ||
                reason.trim()
                  .length < 5
              }
            >
              {busy
                ? "Saving…"
                : "Save owner correction"}
            </Button>


            <Button
              type="button"
              variant="outline"
              disabled={
                busy
              }
              onClick={
                cancel
              }
            >
              Cancel
            </Button>

          </div>

        </form>

      )}

    </section>
  );
}
