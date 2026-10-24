"use server";

import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/safe-redirect";
import {
  newPasswordSchema,
  passwordResetRequestSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  type AuthFormState,
} from "@/shared/contracts/auth";
import { createSupabaseServerClient } from "../core/supabase/server";
import { authErrorMessage } from "./errors";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({ email: text(formData, "email"), password: text(formData, "password") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values: { email: text(formData, "email") } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { status: "error", message: authErrorMessage(error, "sign_in"), values: { email: parsed.data.email } };
  }

  redirect(safeNextPath(text(formData, "next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { displayName: text(formData, "displayName"), email: text(formData, "email") };
  const parsed = signUpSchema.safeParse({
    ...values,
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  });
  if (error) {
    return { status: "error", message: authErrorMessage(error, "sign_up"), values };
  }

  // Same response whether or not the address is already registered (no account enumeration).
  return {
    status: "success",
    message: `If ${parsed.data.email} can be registered, we've sent a confirmation link. Open it to activate your account.`,
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?signed_out=1");
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values: { email: text(formData, "email") } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);
  // Only rate limiting is surfaced; unknown addresses get the same success message.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { status: "error", message: authErrorMessage(error, "reset"), values: { email: parsed.data.email } };
  }

  return {
    status: "success",
    message: `If an account exists for ${parsed.data.email}, we've sent a password reset link.`,
  };
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Your reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: authErrorMessage(error, "update_password") };
  }

  redirect("/?password_updated=1");
}
