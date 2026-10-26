"use client";

import { useActionState } from "react";
import { updateInvestorDetailsAction, type InvestorDetailsState } from "@/app/admin/investors/actions";
import type { ContactField } from "./fields";
import { TextField } from "./FormControls";
import { primaryButton } from "./ui";

interface Props {
  investorId: string;
  current: Record<ContactField, string>;
}

/** Edit an investor's name, email, phone and username. */
export function InvestorDetailsForm(props: Props) {
  const [state, formAction, pending] = useActionState<InvestorDetailsState, FormData>(updateInvestorDetailsAction, {});
  // A new key after every submission re-mounts the fields with the saved (or returned) values.
  return <DetailsBody key={state.attempt ?? 0} {...props} state={state} formAction={formAction} pending={pending} />;
}

function DetailsBody({
  investorId,
  current,
  state,
  formAction,
  pending,
}: Props & { state: InvestorDetailsState; formAction: (data: FormData) => void; pending: boolean }) {
  const values = { ...current, ...state.values };
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={investorId} />
      <TextField label="Name" name="name" defaultValue={values.name} error={errors.name} autoComplete="off" maxLength={100} />
      <TextField
        label="Email"
        name="email"
        type="email"
        defaultValue={values.email}
        error={errors.email}
        autoComplete="off"
        spellCheck={false}
        maxLength={254}
      />
      <TextField
        label="Phone"
        name="phone"
        type="tel"
        defaultValue={values.phone}
        error={errors.phone}
        autoComplete="off"
        optional
        maxLength={25}
      />
      <TextField
        label="Username"
        name="username"
        defaultValue={values.username}
        error={errors.username}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={32}
        hint="The investor signs in with this. 3 to 32 lowercase letters, digits, dots, underscores or hyphens."
      />
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-sm ${state.status === "error" ? "font-medium text-red-700" : "text-emerald-700"}`}
        >
          {state.message}
        </p>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}
