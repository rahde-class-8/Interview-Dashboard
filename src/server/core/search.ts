import "server-only";

/**
 * Builds an ILIKE "contains" pattern from user input, escaping LIKE wildcards
 * so `%` and `_` match literally.
 */
export function containsPattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Quotes a value for use inside a PostgREST `or=(...)` filter, so commas,
 * parentheses and dots in user input cannot alter the filter expression.
 */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
