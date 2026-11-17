import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import axios from 'axios';

const require = createRequire(import.meta.url);

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 120_000;
const E164 = /^\+[1-9]\d{7,14}$/;
const PROVIDER_TIMEOUT = Symbol('provider_timeout');

export type SmsSendState = 'accepted' | 'failed' | 'unknown';

export interface SmsSendResult {
  state: SmsSendState;
  providerMessageId: string | null;
  retryable: boolean;
  statusCode?: number;
}

export interface SmsSendInput {
  to?: unknown;
  text?: unknown;
}

export interface SmsProvider {
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

export interface SmsProviderConfig {
  atUsername?: string;
  atApiKey?: string;
  atSmsFrom?: string;
  atSendTimeoutMs?: number;
  smsTransport?: 'mock' | 'africastalking';
}

export interface SdkSendOptions {
  to: string;
  message: string;
  from?: string;
}

export interface SdkClient {
  SMS: {
    send(options: SdkSendOptions): Promise<unknown> | unknown;
  };
}

type AfricasTalkingFactory = (options: { username: string; apiKey: string }) => SdkClient;

const createAfricasTalking = require('africastalking') as AfricasTalkingFactory;

export const ACCEPTED_RECIPIENT_STATUS_CODES: readonly number[] = Object.freeze([100, 101, 102]);
export const FAILED_RECIPIENT_STATUS_CODES: readonly number[] = Object.freeze([
  401, 402, 403, 404, 405, 406, 407, 409, 502,
]);
export const AMBIGUOUS_RECIPIENT_STATUS_CODES: readonly number[] = Object.freeze([500, 501]);
export const DND_STATUS_CODE = 409;
export const SANDBOX_NETWORK_CODE = '99999';
export const NIGERIA_NETWORK_CODES: Readonly<Record<string, string>> = Object.freeze({
  '62120': 'Airtel Nigeria',
  '62130': 'MTN Nigeria',
  '62150': 'Glo Nigeria',
  '62160': 'Etisalat Nigeria',
});

export const DELIVERY_STATUSES = Object.freeze({
  SENT: 'Sent',
  SUBMITTED: 'Submitted',
  BUFFERED: 'Buffered',
  REJECTED: 'Rejected',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  ABSENT_SUBSCRIBER: 'AbsentSubscriber',
  EXPIRED: 'Expired',
} as const);

export const FINAL_DELIVERY_STATUSES: readonly string[] = Object.freeze([
  DELIVERY_STATUSES.REJECTED,
  DELIVERY_STATUSES.SUCCESS,
  DELIVERY_STATUSES.FAILED,
]);

export const DELIVERY_FIELDS: readonly string[] = Object.freeze([
  'id',
  'status',
  'phoneNumber',
  'networkCode',
  'failureReason',
  'retryCount',
]);

export const INBOUND_SMS_FIELDS: readonly string[] = Object.freeze([
  'date',
  'from',
  'id',
  'linkId',
  'text',
  'to',
  'cost',
  'networkCode',
]);

export const USSD_REQUEST_FIELDS: readonly string[] = Object.freeze([
  'sessionId',
  'phoneNumber',
  'networkCode',
  'serviceCode',
  'text',
]);

export const USSD_EVENT_FIELDS: readonly string[] = Object.freeze([
  'date',
  'sessionId',
  'serviceCode',
  'networkCode',
  'phoneNumber',
  'status',
  'cost',
  'durationInMillis',
  'hopsCount',
  'hopsMetadata',
  'input',
  'lastAppResponse',
  'errorMessage',
]);

const ACCEPTED_CODES = new Set<number>(ACCEPTED_RECIPIENT_STATUS_CODES);
const FAILED_CODES = new Set<number>(FAILED_RECIPIENT_STATUS_CODES);
const TIMEOUT_CODES = new Set<string>([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

export function isFinalDeliveryStatus(status: string): boolean {
  return FINAL_DELIVERY_STATUSES.includes(status);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function smsMessageData(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.SMSMessageData !== undefined) return asRecord(record.SMSMessageData);
  return asRecord(asRecord(record.data)?.SMSMessageData);
}

function sendResult(
  state: SmsSendState,
  providerMessageId: string | null,
  retryable: boolean,
  statusCode?: number,
): SmsSendResult {
  const result: SmsSendResult = { state, providerMessageId, retryable };
  if (statusCode !== undefined && Number.isInteger(statusCode)) result.statusCode = statusCode;
  return result;
}

function accepted(statusCode: number, providerMessageId: string): SmsSendResult {
  return sendResult('accepted', providerMessageId, false, statusCode);
}

function failed(statusCode?: number): SmsSendResult {
  return sendResult('failed', null, false, statusCode);
}

function unknown(statusCode?: number): SmsSendResult {
  return sendResult('unknown', null, false, statusCode);
}

function toStatusCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{3}$/.test(value)) return Number(value);
  return null;
}

function validMessageId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id === 'None' || id.length > 200) return null;
  return id;
}

function parseSendResponse(response: unknown): SmsSendResult {
  const data = smsMessageData(response);
  const recipients = data?.Recipients;
  if (!Array.isArray(recipients) || recipients.length !== 1) return unknown();

  const recipient = recipients[0] as unknown;
  const record = asRecord(recipient);
  if (!record) return unknown();

  const statusCode = toStatusCode(record.statusCode);
  const status = typeof record.status === 'string' ? record.status : '';

  if (statusCode === DND_STATUS_CODE || status === 'DoNotDisturbRejection') {
    return failed(DND_STATUS_CODE);
  }

  // AT documents 100 Processed, 101 Sent and 102 Queued. These are the
  // non-error recipient codes: provider handoff, not handset delivery.
  if (statusCode !== null && ACCEPTED_CODES.has(statusCode)) {
    const providerMessageId = validMessageId(record.messageId);
    return providerMessageId ? accepted(statusCode, providerMessageId) : unknown(statusCode);
  }

  if (statusCode !== null && FAILED_CODES.has(statusCode)) return failed(statusCode);

  // 500/501 are documented recipient errors but do not prove the request was
  // unaccepted; treat them as ambiguous rather than retryable.
  return unknown(statusCode ?? undefined);
}

function httpStatusOf(error: unknown): number | null {
  const status = asRecord(asRecord(error)?.response)?.status;
  return typeof status === 'number' ? status : null;
}

function isTimeoutError(error: unknown): boolean {
  const record = asRecord(error);
  if (!record) return false;
  if (record.name === 'TimeoutError' || record.name === 'AbortError') return true;
  return typeof record.code === 'string' && TIMEOUT_CODES.has(record.code);
}

function isPreSendValidationError(error: unknown): boolean {
  const record = asRecord(error);
  return record?.isJoi === true || record?.name === 'ValidationError';
}

function classifyError(error: unknown): SmsSendResult {
  const httpStatus = httpStatusOf(error);

  if (httpStatus !== null) {
    if (httpStatus >= 500) return unknown();
    if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429) return unknown();

    const parsed = parseSendResponse(asRecord(asRecord(error)?.response)?.data);
    if (parsed.state !== 'unknown') return parsed;
    if (httpStatus === DND_STATUS_CODE) return failed(DND_STATUS_CODE);
    if (httpStatus >= 400) return failed();
  }

  const direct = parseSendResponse(error);
  if (direct.state !== 'unknown') return direct;

  if (error === PROVIDER_TIMEOUT || isTimeoutError(error)) return unknown();
  if (isPreSendValidationError(error)) return failed();
  return unknown();
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(PROVIDER_TIMEOUT), timeoutMs);
  });
  return Promise.race<T>([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function validSendInput(to: unknown, text: unknown): boolean {
  return (
    typeof to === 'string' && E164.test(to) && typeof text === 'string' && text.trim().length > 0
  );
}

/**
 * Create the Africa's Talking SMS provider.
 *
 * `accepted` means Africa's Talking accepted the request for delivery. It does
 * not mean the handset received the message; only a delivery callback with
 * status `Success` establishes delivery.
 */
export function createSmsProvider(
  config: SmsProviderConfig = {},
  { sdkClient }: { sdkClient?: SdkClient } = {},
): SmsProvider {
  const transport = config.smsTransport;
  if (transport !== 'mock' && transport !== 'africastalking') {
    throw new TypeError('smsTransport must be "mock" or "africastalking"');
  }

  const timeoutMs = Number(config.atSendTimeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`atSendTimeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}`);
  }

  const from = typeof config.atSmsFrom === 'string' ? config.atSmsFrom.trim() : '';
  let client: SdkClient | undefined = sdkClient;

  if (transport === 'africastalking' && !client) {
    const username = typeof config.atUsername === 'string' ? config.atUsername.trim() : '';
    const apiKey = typeof config.atApiKey === 'string' ? config.atApiKey.trim() : '';
    if (!username || !apiKey) {
      throw new Error("Africa's Talking credentials are not configured");
    }
    // The 0.8.4 SDK calls axios directly and has no per-call timeout option.
    axios.defaults.timeout = timeoutMs;
    client = createAfricasTalking({ username, apiKey });
  }

  if (transport === 'africastalking' && (!client || typeof client.SMS?.send !== 'function')) {
    throw new TypeError('sdkClient.SMS.send must be a function');
  }

  const liveClient = transport === 'africastalking' ? client : undefined;

  return {
    async send({ to, text }: SmsSendInput = {}): Promise<SmsSendResult> {
      if (!validSendInput(to, text)) return failed();
      if (typeof to !== 'string' || typeof text !== 'string') return failed();

      if (transport === 'mock') {
        return accepted(101, `mock_${randomUUID()}`);
      }

      if (!liveClient) return unknown();

      const options: SdkSendOptions = { to, message: text };
      if (from) options.from = from;

      let response: unknown;
      try {
        response = await withDeadline(
          Promise.resolve().then(() => liveClient.SMS.send(options)),
          timeoutMs,
        );
      } catch (error) {
        return classifyError(error);
      }

      try {
        return parseSendResponse(response);
      } catch {
        return unknown();
      }
    },
  };
}
