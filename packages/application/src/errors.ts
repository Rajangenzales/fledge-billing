export type ErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_MISSING"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;

  constructor(code: ErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export function toUserFacingMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  return "Something went wrong. Check the logs for details.";
}
