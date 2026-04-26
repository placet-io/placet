import { BadRequestException } from '@nestjs/common';

/**
 * Sanity-check helpers for the management proxy controllers.
 *
 * The proxy is intentionally permissive — it forwards bodies to the agent's
 * upstream `/api/v1/*` API verbatim — but a few minimum invariants stop the
 * most common abuse vectors before we burn an outbound HTTP call:
 *
 * - Bodies must be JSON objects (not arrays, null, scalars, or strings). The
 *   agent contract for every write endpoint is "object with named fields";
 *   any other shape is guaranteed to fail upstream and just costs latency.
 * - When the upstream contract requires a specific top-level field (`name`
 *   for cron/MCP/A2A creates), we assert it is a non-empty string here so
 *   the user gets an immediate 400 with a useful message instead of a
 *   normalized `upstream_400` envelope ten seconds later.
 *
 * Anything beyond these guarantees stays the agent's responsibility — we
 * don't want Placet to drift out of sync with upstream when new optional
 * fields are added.
 */

export function assertObjectBody(
  body: unknown,
  label = 'Request body',
): asserts body is Record<string, unknown> {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    body instanceof Date
  ) {
    throw new BadRequestException(`${label} must be a JSON object`);
  }
}

export function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(
      `Field "${field}" must be a non-empty string`,
    );
  }
}
