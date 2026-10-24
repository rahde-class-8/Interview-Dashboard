import { z } from "zod";

/** Shared validation for authentication forms (client hints + server enforcement). */

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt (used by Supabase Auth) only considers the first 72 bytes.
export const PASSWORD_MAX_LENGTH = 72;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "Email address is too long.")
  .pipe(z.email("Enter a valid email address."));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(120, "Name is too long.");

export const signInSchema = z.object({
  email: emailSchema,
  // Do not reveal password rules at sign-in; only require a value.
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH),
});

export const signUpSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type FieldErrors = Partial<Record<string, string>>;

/** Result shape returned by auth Server Actions to `useActionState`. */
export interface AuthFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echo of non-secret fields so the form can be repopulated after an error. */
  values?: Record<string, string>;
}

export const initialAuthFormState: AuthFormState = { status: "idle" };

/** Converts zod issues to the first message per field. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
