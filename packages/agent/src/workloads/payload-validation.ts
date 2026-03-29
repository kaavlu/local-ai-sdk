import type { PayloadValidationResult } from './types.js';

/**
 * Shared rule: non-empty string field `text` on an object payload.
 */
export function validateTextObjectPayload(
  taskType: string,
  payload: unknown,
): PayloadValidationResult {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      message: `${taskType} payload must be an object with a non-empty string field "text"`,
    };
  }
  const text = (payload as Record<string, unknown>).text;
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      ok: false,
      message: `${taskType} payload must include a non-empty string field "text"`,
    };
  }
  return { ok: true };
}

/**
 * Runtime parse used by local executors; throws with the same messages as validation.
 */
export function parseNonEmptyTextPayload(taskType: string, payload: unknown): string {
  const v = validateTextObjectPayload(taskType, payload);
  if (!v.ok) {
    throw new Error(v.message);
  }
  const text = (payload as Record<string, unknown>).text;
  return typeof text === 'string' ? text : String(text);
}
