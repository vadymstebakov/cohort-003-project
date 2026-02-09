import type { z } from "zod";

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = {
  success: false;
  errors: Record<string, string>;
};
type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/**
 * Converts FormData to a plain object, validates with a Zod schema,
 * and returns either the parsed data or a field-error map (first error per field).
 */
export function parseFormData<T extends z.ZodType>(
  formData: FormData,
  schema: T
): ParseResult<z.infer<T>> {
  const raw = Object.fromEntries(formData);
  const result = schema.safeParse(raw);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  const errors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      errors[key] = messages[0];
    }
  }

  return { success: false, errors };
}
