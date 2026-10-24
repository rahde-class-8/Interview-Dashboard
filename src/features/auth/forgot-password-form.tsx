"use client";

import { useActionState } from "react";

import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/server/auth/actions";
import { initialAuthFormState } from "@/shared/contracts/auth";
import { FormMessage } from "./form-message";

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initialAuthFormState);
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return <FormMessage tone="success">{state.message}</FormMessage>;
  }

  return (
    <form action={action} noValidate className="space-y-4">
      {state.status === "idle" && notice && <FormMessage tone="error">{notice}</FormMessage>}
      <FormMessage tone="error">{state.status === "error" ? state.message : undefined}</FormMessage>
      <Field id="forgot-email" label="Email" error={errors.email}>
        <Input
          {...fieldAria("forgot-email", errors.email)}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
