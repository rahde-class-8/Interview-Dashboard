"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/server/auth/actions";
import { initialAuthFormState } from "@/shared/contracts/auth";
import { FormMessage } from "./form-message";

export function LoginForm({ next, notice }: { next?: string; notice?: { tone: "error" | "success" | "info"; text: string } }) {
  const [state, action, pending] = useActionState(signIn, initialAuthFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-4">
      {state.status === "idle" && notice && <FormMessage tone={notice.tone}>{notice.text}</FormMessage>}
      <FormMessage tone="error">{state.status === "error" ? state.message : undefined}</FormMessage>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="login-email" label="Email" error={errors.email}>
        <Input
          {...fieldAria("login-email", errors.email)}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          required
        />
      </Field>
      <Field id="login-password" label="Password" error={errors.password}>
        <Input
          {...fieldAria("login-password", errors.password)}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
