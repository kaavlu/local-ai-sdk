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

const DEFAULT_MAX_NEW_TOKENS = 64;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 0.95;
const MAX_NEW_TOKENS_MIN = 1;
const MAX_NEW_TOKENS_MAX = 256;
const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;
const TOP_P_MIN = 0;
const TOP_P_MAX = 1;

export interface GenerateTextPayload {
  text: string;
  maxNewTokens: number;
  temperature: number;
  topP: number;
}

function readFiniteNumberField(
  payload: Record<string, unknown>,
  field: string,
): number | undefined | null {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }
  const raw = payload[field];
  if (raw === null) {
    return null;
  }
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function validateBoundedNumberField(
  payload: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): PayloadValidationResult {
  const n = readFiniteNumberField(payload, field);
  if (n === undefined) {
    return { ok: true };
  }
  if (n === null || n < min || n > max) {
    return {
      ok: false,
      message: `generate_text payload field "${field}" must be a finite number in [${min}, ${max}]`,
    };
  }
  return { ok: true };
}

/**
 * `generate_text` payload:
 * - required: non-empty string `text`
 * - optional bounded controls: `max_new_tokens`, `temperature`, `top_p`
 */
export function validateGenerateTextPayload(payload: unknown): PayloadValidationResult {
  const base = validateTextObjectPayload('generate_text', payload);
  if (!base.ok) {
    return base;
  }
  const o = payload as Record<string, unknown>;
  const maxNewTokensCheck = validateBoundedNumberField(
    o,
    'max_new_tokens',
    MAX_NEW_TOKENS_MIN,
    MAX_NEW_TOKENS_MAX,
  );
  if (!maxNewTokensCheck.ok) {
    return maxNewTokensCheck;
  }
  const temperatureCheck = validateBoundedNumberField(
    o,
    'temperature',
    TEMPERATURE_MIN,
    TEMPERATURE_MAX,
  );
  if (!temperatureCheck.ok) {
    return temperatureCheck;
  }
  const topPCheck = validateBoundedNumberField(o, 'top_p', TOP_P_MIN, TOP_P_MAX);
  if (!topPCheck.ok) {
    return topPCheck;
  }
  return { ok: true };
}

/**
 * Runtime parse for `generate_text`; throws with the same messages as validation.
 */
export function parseGenerateTextPayload(payload: unknown): GenerateTextPayload {
  const v = validateGenerateTextPayload(payload);
  if (!v.ok) {
    throw new Error(v.message);
  }
  const o = payload as Record<string, unknown>;
  const text = parseNonEmptyTextPayload('generate_text', payload);
  const maxNewTokensRaw = readFiniteNumberField(o, 'max_new_tokens');
  const temperatureRaw = readFiniteNumberField(o, 'temperature');
  const topPRaw = readFiniteNumberField(o, 'top_p');
  return {
    text,
    maxNewTokens:
      typeof maxNewTokensRaw === 'number' ? Math.trunc(maxNewTokensRaw) : DEFAULT_MAX_NEW_TOKENS,
    temperature: typeof temperatureRaw === 'number' ? temperatureRaw : DEFAULT_TEMPERATURE,
    topP: typeof topPRaw === 'number' ? topPRaw : DEFAULT_TOP_P,
  };
}
