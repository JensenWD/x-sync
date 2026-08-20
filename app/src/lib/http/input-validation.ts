export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputValidationError';
  }
}

export async function jsonObject(request: Request) {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputValidationError('Request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

export function positiveInteger(value: unknown, field: string) {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    value === '' ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  ) {
    throw new InputValidationError(`${field} must be a positive integer`);
  }
  return Number(value);
}

export function boundedName(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string') {
    throw new InputValidationError(`${field} must be a string`);
  }
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new InputValidationError(`${field} must contain 1 to ${maximum} printable characters`);
  }
  return normalized;
}

export function optionalHexColor(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/iu.test(value)) {
    throw new InputValidationError('color must be a six-digit hex color such as #1d9bf0');
  }
  return value.toLowerCase();
}

export function positiveIntegerArray(value: unknown, field: string, maximum: number) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new InputValidationError(`${field} must contain between 1 and ${maximum} IDs`);
  }
  return [...new Set(value.map((item) => positiveInteger(item, field)))];
}

export function validationResponse(error: unknown) {
  if (!(error instanceof InputValidationError)) return null;
  return Response.json({ error: error.message }, { status: 400 });
}
