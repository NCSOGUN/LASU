import type { Projection, RecordField } from './types.js';

export function buildProjection(
  fields: RecordField[],
  readSessionId?: string | null,
): Projection {
  const available = fields.length > 0;
  return readSessionId
    ? { available, fields, read_session_id: readSessionId }
    : { available, fields };
}

export function deniedProjection(): Projection {
  return { available: false, fields: [] };
}

export function sortFields<T extends { sort_order: number; field_key: string }>(rows: T[]) {
  return [...rows].sort(
    (left, right) =>
      left.sort_order - right.sort_order || left.field_key.localeCompare(right.field_key),
  );
}

export function paginate<T>(values: T[], page: number, pageSize: number) {
  const total = values.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  return {
    items: values.slice(start, start + pageSize),
    page: current,
    pageSize,
    total,
    totalPages,
  };
}
