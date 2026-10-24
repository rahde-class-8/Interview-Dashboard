"use client";

import { useActionState } from "react";

import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/server/auth/actions";
import { PASSWORD_MIN_LENGTH, initialAuthFormState } from "@/shared/contracts/auth";
import { FormMessage } from "./form-message";

const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`;

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUp, initialAuthFormState);
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return <FormMessage tone="success">{state.message}</FormMessage>;
  }

  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage tone="error">{state.status === "error" ? state.message : undefined}</FormMessage>
      <Field id="register-name" label="Name" error={errors.displayName}>
        <Input
          {...fieldAria("register-name", errors.displayName)}
          name="displayName"
          autoComplete="name"
          defaultValue={state.values?.displayName}
          required
        />
      </Field>
      <Field id="register-email" label="Email" error={errors.email}>
        <Input
          {...fieldAria("register-email", errors.email)}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          required
        />
      </Field>
      <Field id="register-password" label="Password" hint={PASSWORD_HINT} error={errors.password}>
        <Input
          {...fieldAria("register-password", errors.password, PASSWORD_HINT)}
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Field id="register-confirm" label="Confirm password" error={errors.confirmPassword}>
        <Input
          {...fieldAria("register-confirm", errors.confirmPassword)}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
