import "server-only";

interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

/**
 * Maps Supabase Auth errors to safe, user-facing messages. Never returns raw
 * provider messages, and never confirms whether an account exists.
 */
export function authErrorMessage(error: AuthErrorLike, context: "sign_in" | "sign_up" | "reset" | "update_password"): string {
  const code = error.code ?? "";
  if (error.status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (code === "weak_password") {
    return "Choose a stronger password (at least 8 characters with letters and numbers).";
  }
  if (code === "same_password") {
    return "Choose a password different from your current one.";
  }
  switch (context) {
    case "sign_in":
      if (code === "email_not_confirmed") {
        return "Confirm your email address first — check your inbox for the confirmation link.";
      }
      return "Invalid email or password.";
    case "sign_up":
      return "We couldn't create your account. Please try again.";
    case "reset":
      return "We couldn't send the reset email. Please try again.";
    case "update_password":
      return "We couldn't update your password. Request a new reset link and try again.";
  }
}
