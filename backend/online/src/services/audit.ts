import type { AuditChannel, AuditOutcome } from '@prisma/client';
import { prisma } from '../db.js';

export interface AuditInput {
  requestId?: string;
  actorAccountId?: string | null;
  patientId?: string | null;
  channel: AuditChannel;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome: AuditOutcome;
  reasonCode?: string | null;
  fieldKeys?: string[];
  actorRef?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput) {
  await prisma.auditEvent.create({
    data: {
      request_id: input.requestId ?? '',
      actor_account_id: input.actorAccountId ?? null,
      patient_id: input.patientId ?? null,
      channel: input.channel,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      outcome: input.outcome,
      reason_code: input.reasonCode ?? null,
      field_keys: input.fieldKeys ?? [],
      actor_ref: input.actorRef ?? null,
      metadata: (input.metadata ?? {}) as object,
    },
  });
}

export async function recordAiAudit(input: Omit<AuditInput, 'channel'> & { model: string }) {
  await recordAudit({
    ...input,
    channel: 'SYSTEM',
    actorRef: `ai:${input.model}`,
    metadata: { ...(input.metadata ?? {}), model: input.model },
  });
}
