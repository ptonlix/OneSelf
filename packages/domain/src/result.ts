export type DomainErrorCode =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "invalid"
  | "payload_too_large"
  | "password_change_required";

export type DomainFailure = {
  readonly ok: false;
  readonly error: DomainErrorCode;
  readonly message: string;
};

export type DomainSuccess<T> = {
  readonly ok: true;
  readonly value: T;
};

export type DomainResult<T> = DomainSuccess<T> | DomainFailure;

export function ok<T>(value: T): DomainSuccess<T> {
  return { ok: true, value };
}

export function fail(error: DomainErrorCode, message: string): DomainFailure {
  return { ok: false, error, message };
}
