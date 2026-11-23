import { Schema } from "effect";

/** Maps to an HTTP status at the API edge; messages are safe to show to the user. */
export const IbkrLoginErrorReasonSchema = Schema.Literals([
  "BadRequest",
  "Unauthorized",
  "Forbidden",
  "Conflict",
  "Rejected",
  "Upstream",
]);
export type IbkrLoginErrorReason = typeof IbkrLoginErrorReasonSchema.Type;

/** A failed browser-login step; never carries credentials or vendor response bodies. */
// oxlint-disable-next-line unicorn/throw-new-error -- This declares an Effect tagged error class.
export class IbkrLoginError extends Schema.TaggedError<IbkrLoginError>()(
  "IbkrLoginError",
  {
    reason: IbkrLoginErrorReasonSchema,
    message: Schema.String,
  }
) {}

export const ibkrLoginError = (reason: IbkrLoginErrorReason, message: string) =>
  new IbkrLoginError({ reason, message });
