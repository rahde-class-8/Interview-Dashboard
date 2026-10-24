"use client";

import { useActionState } from "react";

import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/server/auth/actions";
import { PASSWORD_MIN_LENGTH, initialAuthFormState } from "@/shared/contracts/auth";
import { FormMessage } from "./form-message";

const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`;

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialAuthFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage tone="error">{state.status === "error" ? state.message : undefined}</FormMessage>
      <Field id="reset-password" label="New password" hint={PASSWORD_HINT} error={errors.password}>
        <Input
          {...fieldAria("reset-password", errors.password, PASSWORD_HINT)}
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Field id="reset-confirm" label="Confirm new password" error={errors.confirmPassword}>
        <Input
          {...fieldAria("reset-confirm", errors.confirmPassword)}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
