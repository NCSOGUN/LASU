import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCEPTED_RECIPIENT_STATUS_CODES,
  AMBIGUOUS_RECIPIENT_STATUS_CODES,
  DELIVERY_FIELDS,
  DELIVERY_STATUSES,
  DND_STATUS_CODE,
  FAILED_RECIPIENT_STATUS_CODES,
  FINAL_DELIVERY_STATUSES,
  INBOUND_SMS_FIELDS,
  NIGERIA_NETWORK_CODES,
  SANDBOX_NETWORK_CODE,
  USSD_EVENT_FIELDS,
  USSD_REQUEST_FIELDS,
  createSmsProvider,
  isFinalDeliveryStatus,
} from '../src/providers/africastalking.js';
import type {
  SdkSendOptions,
  SmsProvider,
  SmsProviderConfig,
  SmsSendInput,
} from '../src/providers/africastalking.js';

const TO = '+2348000000001';
const TEXT = 'HealthAccess test message';

const baseConfig: SmsProviderConfig = {
  atUsername: 'sandbox',
  atApiKey: 'test-api-key',
  atSmsFrom: '12345',
  atSendTimeoutMs: 50,
  smsTransport: 'africastalking',
};

type SendFunction = (options: SdkSendOptions) => Promise<unknown> | unknown;

function success(statusCode = 101, messageId = 'ATXid_test_0001'): unknown {
  return {
    SMSMessageData: {
      Message: 'Sent to 1/1 Total Cost: NGN 4.0000',
      Recipients: [
        {
          statusCode,
          number: TO,
          status: 'Success',
          cost: 'NGN 4.0000',
          messageId,
        },
      ],
    },
  };
}

function provider(send: SendFunction, overrides: Partial<SmsProviderConfig> = {}): SmsProvider {
  return createSmsProvider({ ...baseConfig, ...overrides }, { sdkClient: { SMS: { send } } });
}

test('exports the verified delivery field and status contract', () => {
  assert.deepEqual(DELIVERY_FIELDS, [
    'id',
    'status',
    'phoneNumber',
    'networkCode',
    'failureReason',
    'retryCount',
  ]);
  assert.deepEqual(INBOUND_SMS_FIELDS, [
    'date',
    'from',
    'id',
    'linkId',
    'text',
    'to',
    'cost',
    'networkCode',
  ]);
  assert.deepEqual(USSD_REQUEST_FIELDS, [
    'sessionId',
    'phoneNumber',
    'networkCode',
    'serviceCode',
    'text',
  ]);
  assert.deepEqual(USSD_EVENT_FIELDS, [
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
  assert.equal(DELIVERY_STATUSES.SUCCESS, 'Success');
  assert.equal(DELIVERY_STATUSES.ABSENT_SUBSCRIBER, 'AbsentSubscriber');
  assert.deepEqual(FINAL_DELIVERY_STATUSES, ['Rejected', 'Success', 'Failed']);
  assert.equal(isFinalDeliveryStatus('Success'), true);
  assert.equal(isFinalDeliveryStatus('Sent'), false);
  assert.equal(isFinalDeliveryStatus('AbsentSubscriber'), false);
  assert.equal(DND_STATUS_CODE, 409);
  assert.equal(SANDBOX_NETWORK_CODE, '99999');
  assert.equal(NIGERIA_NETWORK_CODES['62130'], 'MTN Nigeria');
});

test('mock transport accepts without calling the SDK and never claims delivery', async () => {
  let called = false;
  const sms = createSmsProvider(
    { ...baseConfig, smsTransport: 'mock' },
    {
      sdkClient: {
        SMS: {
          send: async () => {
            called = true;
            return success();
          },
        },
      },
    },
  );

  const result = await sms.send({ to: TO, text: TEXT });

  assert.equal(called, false);
  assert.equal(result.state, 'accepted');
  assert.equal(result.retryable, false);
  assert.equal(result.statusCode, 101);
  assert.match(String(result.providerMessageId), /^mock_[0-9a-f-]{36}$/);
});

test('known pre-send validation errors fail without touching the SDK', async () => {
  let calls = 0;
  const sms = provider(async () => {
    calls += 1;
    return success();
  });

  const invalid: SmsSendInput[] = [
    {},
    { to: '08030000000', text: TEXT },
    { to: TO, text: '' },
    { to: TO, text: '   ' },
    { to: [TO], text: TEXT },
    { to: TO, text: 42 },
  ];

  for (const input of invalid) {
    const result = await sms.send(input);
    assert.equal(result.state, 'failed');
    assert.equal(result.providerMessageId, null);
    assert.equal(result.retryable, false);
    assert.equal(result.statusCode, undefined);
  }
  assert.equal(calls, 0);
});

test('only documented recipient success codes are accepted, not delivered', async () => {
  for (const statusCode of ACCEPTED_RECIPIENT_STATUS_CODES) {
    let calls = 0;
    const sms = provider(async () => {
      calls += 1;
      return success(statusCode, `ATXid_${statusCode}`);
    });

    const result = await sms.send({ to: TO, text: TEXT });

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      state: 'accepted',
      providerMessageId: `ATXid_${statusCode}`,
      retryable: false,
      statusCode,
    });
  }
});

test('documented recipient failures fail without retry', async () => {
  for (const statusCode of FAILED_RECIPIENT_STATUS_CODES) {
    const sms = provider(async () => success(statusCode, 'None'));
    const result = await sms.send({ to: TO, text: TEXT });

    assert.equal(result.state, 'failed');
    assert.equal(result.providerMessageId, null);
    assert.equal(result.retryable, false);
    assert.equal(result.statusCode, statusCode);
  }
});

test('recipient 500/501 are ambiguous and never retryable', async () => {
  for (const statusCode of AMBIGUOUS_RECIPIENT_STATUS_CODES) {
    const sms = provider(async () => success(statusCode, 'ATXid_ambiguous'));
    const result = await sms.send({ to: TO, text: TEXT });

    assert.equal(result.state, 'unknown');
    assert.equal(result.providerMessageId, null);
    assert.equal(result.retryable, false);
    assert.equal(result.statusCode, statusCode);
  }
});

test('empty or malformed provider responses are unknown', async () => {
  const responses: unknown[] = [
    null,
    {},
    { SMSMessageData: {} },
    { SMSMessageData: { Recipients: [] } },
    { SMSMessageData: { Recipients: [{ statusCode: 101, messageId: '' }] } },
    { SMSMessageData: { Recipients: [{ statusCode: 101, messageId: 'None' }] } },
    {
      SMSMessageData: {
        Recipients: [
          { statusCode: 101, messageId: 'ATXid_one' },
          { statusCode: 101, messageId: 'ATXid_two' },
        ],
      },
    },
    { SMSMessageData: { Recipients: [{ statusCode: 999, messageId: 'ATXid_unknown' }] } },
  ];

  for (const response of responses) {
    const sms = provider(async () => response);
    const result = await sms.send({ to: TO, text: TEXT });

    assert.equal(result.state, 'unknown');
    assert.equal(result.providerMessageId, null);
    assert.equal(result.retryable, false);
  }
});

test('Nigeria DND HTTP 409 is a failed send with no provider message id', async () => {
  const error = Object.assign(new Error('Request failed with status code 409'), {
    isAxiosError: true,
    response: {
      status: 409,
      data: {
        SMSMessageData: {
          Message: 'Sent to 0/1 Total Cost: 0',
          Recipients: [
            {
              cost: '0',
              messageId: 'None',
              number: TO,
              status: 'DoNotDisturbRejection',
              statusCode: 409,
            },
          ],
        },
      },
    },
  });

  const sms = provider(async () => {
    throw error;
  });
  const result = await sms.send({ to: TO, text: TEXT });

  assert.deepEqual(result, {
    state: 'failed',
    providerMessageId: null,
    retryable: false,
    statusCode: 409,
  });
});

test('HTTP 5xx, request timeout and rate limit are ambiguous and not retryable', async () => {
  for (const status of [500, 502, 503, 408, 425, 429]) {
    const error = Object.assign(new Error('provider HTTP failure'), {
      response: { status, data: {} },
    });
    const sms = provider(async () => {
      throw error;
    });
    const result = await sms.send({ to: TO, text: TEXT });

    assert.equal(result.state, 'unknown');
    assert.equal(result.providerMessageId, null);
    assert.equal(result.retryable, false);
  }
});

test('HTTP 4xx is failed, while a documented recipient error in the body is preserved', async () => {
  const authError = Object.assign(new Error('unauthorized'), {
    response: { status: 401, data: { message: 'Unauthorized' } },
  });
  const authResult = await provider(async () => {
    throw authError;
  }).send({ to: TO, text: TEXT });

  assert.equal(authResult.state, 'failed');
  assert.equal(authResult.retryable, false);
  assert.equal(authResult.statusCode, undefined);

  const invalidSender = Object.assign(new Error('bad request'), {
    response: {
      status: 400,
      data: {
        SMSMessageData: {
          Recipients: [{ statusCode: 402, messageId: 'None', status: 'InvalidSenderId' }],
        },
      },
    },
  });
  const invalidResult = await provider(async () => {
    throw invalidSender;
  }).send({ to: TO, text: TEXT });

  assert.equal(invalidResult.state, 'failed');
  assert.equal(invalidResult.statusCode, 402);
});

test('transport errors, SDK validation errors and a deadline are classified safely', async () => {
  const transport = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
  const transportResult = await provider(async () => {
    throw transport;
  }).send({ to: TO, text: TEXT });
  assert.equal(transportResult.state, 'unknown');
  assert.equal(transportResult.retryable, false);

  const validation = Object.assign(new Error('must be a valid phone number'), {
    isJoi: true,
    name: 'ValidationError',
  });
  const validationResult = await provider(async () => {
    throw validation;
  }).send({ to: TO, text: TEXT });
  assert.equal(validationResult.state, 'failed');
  assert.equal(validationResult.retryable, false);

  let release: ((value: unknown) => void) | undefined;
  const hung = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const started = Date.now();
  const timeoutResult = await provider(async () => hung, { atSendTimeoutMs: 10 }).send({
    to: TO,
    text: TEXT,
  });

  assert.equal(timeoutResult.state, 'unknown');
  assert.equal(timeoutResult.providerMessageId, null);
  assert.equal(timeoutResult.retryable, false);
  assert.ok(Date.now() - started < 500);
  release?.(success());
});

test('real transport sends one recipient with the configured sender', async () => {
  let seen: SdkSendOptions | undefined;
  const sms = provider(
    async (options) => {
      seen = options;
      return success();
    },
    { atSmsFrom: '  12345  ' },
  );

  await sms.send({ to: TO, text: TEXT });

  assert.deepEqual(seen, { to: TO, message: TEXT, from: '12345' });
});

test('configuration errors do not expose API keys or allow invalid transports', () => {
  assert.throws(
    () =>
      createSmsProvider({
        ...baseConfig,
        atApiKey: '',
        smsTransport: 'africastalking',
      }),
    /credentials are not configured/,
  );

  assert.throws(
    () => createSmsProvider({ ...baseConfig, smsTransport: 'other' as never }),
    /smsTransport/,
  );

  assert.throws(() => createSmsProvider({ ...baseConfig, atSendTimeoutMs: 0 }), /atSendTimeoutMs/);

  assert.throws(
    () =>
      createSmsProvider(
        { ...baseConfig, smsTransport: 'africastalking' },
        { sdkClient: { SMS: {} as never } },
      ),
    /sdkClient\.SMS\.send/,
  );
});
