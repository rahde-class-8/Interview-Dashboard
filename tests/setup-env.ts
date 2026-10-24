// Next.js intentionally ignores .env.local when NODE_ENV=test, so load it explicitly.
// Local development values only; CI provides the same variables via its environment.
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
