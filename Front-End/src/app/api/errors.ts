export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorInit {
  status: number;
  message: string;
  code?: string;
  contactEmail?: string;
  fieldErrors?: FieldError[];
}

/** Error thrown for every non-2xx API response. `message` is always safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly contactEmail?: string;
  readonly fieldErrors: FieldError[];

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.contactEmail = init.contactEmail;
    this.fieldErrors = init.fieldErrors ?? [];
  }

  get isDemoExpired(): boolean {
    return this.status === 403 && this.code === "demo_expired";
  }
}

function fieldName(loc: unknown): string {
  if (!Array.isArray(loc)) return "";
  return loc
    .filter((part) => part !== "body" && part !== "query" && part !== "path")
    .map(String)
    .join(".");
}

/**
 * Parses an error response body. FastAPI uses three `detail` shapes:
 *  - string                         (HTTPException with a message)
 *  - list of {loc, msg, type}       (422 validation errors)
 *  - object {code, message, contactEmail?}  (structured, e.g. demo_expired)
 */
export function parseApiError(status: number, bodyText: string): ApiError {
  const fallback = `Request failed: ${status}`;
  const text = (bodyText ?? "").trim();
  if (!text) return new ApiError({ status, message: fallback });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new ApiError({ status, message: text.length > 300 ? fallback : text });
  }

  const detail = parsed && typeof parsed === "object" ? (parsed as { detail?: unknown }).detail : undefined;

  if (typeof detail === "string" && detail.trim()) {
    return new ApiError({ status, message: detail });
  }

  if (Array.isArray(detail)) {
    const fieldErrors: FieldError[] = detail
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        field: fieldName(item.loc),
        message: typeof item.msg === "string" ? item.msg.replace(/^Value error, /, "") : "Invalid value",
      }));
    const message = fieldErrors.length
      ? fieldErrors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join("; ")
      : fallback;
    return new ApiError({ status, message, fieldErrors });
  }

  if (detail && typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    return new ApiError({
      status,
      message: typeof obj.message === "string" && obj.message ? obj.message : fallback,
      code: typeof obj.code === "string" ? obj.code : undefined,
      contactEmail: typeof obj.contactEmail === "string" ? obj.contactEmail : undefined,
    });
  }

  if (parsed && typeof parsed === "object" && typeof (parsed as { message?: unknown }).message === "string") {
    return new ApiError({ status, message: (parsed as { message: string }).message });
  }

  return new ApiError({ status, message: fallback });
}

type SessionExpiredHandler = (error: ApiError) => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

/** AuthContext registers this so an expired demo token anywhere logs the user out. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null) {
  sessionExpiredHandler = handler;
}

export function notifySessionExpired(error: ApiError) {
  sessionExpiredHandler?.(error);
}
