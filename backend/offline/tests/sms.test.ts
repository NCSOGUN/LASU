import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmsEngine, isPotentiallyUrgent } from '../src/channels/sms.js';
import type { SmsRepository, SmsResult } from '../src/channels/sms.js';
import { smsSegments, renderFacility, renderWebLead } from '../src/channels/render.js';
import type { WebLead } from '../src/types.js';

const services = [
  { service_code: 'general', label: 'General care' },
  { service_code: 'pediatrics', label: 'Child health' },
];
function textOf(result: SmsResult) {
  const reply = result.replies[0];
  return reply.kind === 'text' ? reply.text : '';
}

function lead(id: string, name = 'Live Emergency Hospital'): WebLead {
  return {
    name,
    address: `${id} Marina Road, Lagos`,
    phone: '+2349091481560',
    latitude: null,
    longitude: null,
    source_url: `https://maps.google.com/?cid=${id}`,
    source_reference: id,
    verification_status: 'unverified',
    service_label: 'Emergency hospital',
  };
}

function setup(
  overrides: Partial<SmsRepository> = {},
  search?: {
    discoverFacilities(request: { serviceLabel: string; area: string }): Promise<WebLead[]>;
    discoverEmergency?(request: { area: string }): Promise<WebLead[]>;
  },
) {
  const calls: string[] = [];
  const repository: SmsRepository = {
    listServices: async () => services,
    setOptOut: async () => {},
    findAreas: async () => [{ id: 'area1', name: 'Ikeja' }],
    findFacilities: async () => [
      { id: 'facility1', name: 'Example', address: 'Test', phone: null, distance_km: null },
    ],
    readEmergency: async () => ({
      available: true,
      fields: [{ key: 'allergies', label: 'Allergies', value: ['Test'] }],
    }),
    findProfileConsent: async () => null,
    readMatchingContext: async () => ({ available: false }),
    storeWebLeads: async () => ['lead1'],
    ...overrides,
  };
  return {
    calls,
    engine: createSmsEngine({
      repository,
      config: { searchRadiusKm: 25, allowLiveWeb: true, profileUseEnabled: false },
      crypto: { digestCode: () => 'digest' },
      assistant: {
        classify: async () => {
          calls.push('AI');
          return {
            intent: 'unsupported',
            service_code: null,
            location_query: null,
            question: null,
          };
        },
        answer: async () => ({ text: 'Safe fallback.' }),
      },
      search,
    }),
  };
}

test('deterministic FIND works without AI and prompts for missing area', async () => {
  const { engine, calls } = setup();
  const first = await engine.process('FIND child health');
  assert.equal(first.state, 'awaiting_area');
  const next = await engine.process('Ikeja', first);
  assert.equal(next.state, 'showing_results');
  assert.equal(next.replies[0].kind, 'facility');
  assert.equal(next.replies[0].kind === 'facility' && next.replies[0].id, 'facility1');
  assert.deepEqual(calls, []);
  assert.equal((await engine.process('FIND child health near Ikeja')).state, 'showing_results');
});

test('LOOKUP queues a digest render reference, never medical snapshots', async () => {
  const { engine, calls } = setup();
  const reply = await engine.process('LOOKUP 123456789012');
  assert.deepEqual(reply.replies, [{ kind: 'emergency', codeDigest: 'digest' }]);
  assert.equal(JSON.stringify(reply).includes('Test'), false);
  assert.deepEqual(calls, []);
  assert.match(textOf(await engine.process('LOOKUP 123')), /12-digit/);
});

test('code-like inputs never reach a model and urgency bypasses clarification', async () => {
  const { engine, calls } = setup();
  await engine.process('Please explain 12345678');
  const urgent = await engine.process('I cannot breathe', {
    state: 'awaiting_area',
    context: { serviceCode: 'general' },
  });
  assert.match(textOf(urgent), /immediate in-person/);
  assert.match(textOf(urgent), /call 112/);
  assert.match(textOf(urgent), /EMERGENCY <area>/);
  assert.deepEqual(calls, []);
  assert.equal(isPotentiallyUrgent('I am suicidal'), true);
  const withPhone = await engine.process('I cannot breathe, call 08030000000');
  assert.match(textOf(withPhone), /immediate in-person/);
  assert.equal(isPotentiallyUrgent('I can\u2019t breathe'), true);
  assert.match(
    textOf(await engine.process('LOOKUP 123456789012 I cannot breathe')),
    /immediate in-person/,
  );
  assert.deepEqual(calls, []);
});

test('MORE needs a live result list; CANCEL clears transient context', async () => {
  const { engine } = setup();
  assert.match(textOf(await engine.process('MORE')), /no active result/);
  const cancelled = await engine.process('CANCEL', {
    state: 'awaiting_area',
    context: { serviceCode: 'general' },
  });
  assert.equal(cancelled.state, 'closed');
  assert.deepEqual(cancelled.context, {});
});

test('ambiguous locations require one offered choice; unlisted facilities are never invented', async () => {
  const { engine } = setup({
    findAreas: async () => [
      { id: 'a', name: 'Ikeja' },
      { id: 'b', name: 'Ikeja' },
    ],
  });
  const ambiguous = await engine.process('FIND general near Ikeja');
  assert.equal(ambiguous.state, 'awaiting_area_choice');
  assert.equal((await engine.process('9', ambiguous)).state, 'awaiting_area_choice');
  assert.equal((await engine.process('1', ambiguous)).state, 'showing_results');
});

test('rendering distinguishes verified directory from unverified leads and encoding budgets', () => {
  assert.match(
    renderFacility({ id: 'f', name: 'Example', address: 'Test', phone: null, distance_km: null }),
    /Distance unavailable/,
  );
  assert.match(
    renderWebLead({
      name: 'Example',
      address: 'Test',
      phone: null,
      source_url: 'https://example.org',
    }),
    /Unverified/,
  );
  assert.deepEqual(smsSegments('a'.repeat(160)), { encoding: 'GSM-7', segments: 1 });
  assert.equal(smsSegments('a'.repeat(161)).segments, 2);
  assert.equal(smsSegments('^'.repeat(81)).segments, 2);
  assert.deepEqual(smsSegments('\u4e2d'.repeat(71)), { encoding: 'UCS-2', segments: 2 });
});

test('EMERGENCY prompts for an area, returns live leads, records the request and pages with MORE', async () => {
  const emergencyRequests: Array<{ area: string; count: number }> = [];
  const searched: string[] = [];
  const { engine } = setup(
    {
      storeWebLeads: async () => ['lead1', 'lead2'],
      recordEmergencyRequest: async (request) => {
        emergencyRequests.push({
          area: request.location_text,
          count: request.results.length,
        });
        assert.equal(request.channel, 'SMS');
        assert.equal(request.area_id, null);
      },
    },
    {
      discoverFacilities: async () => [],
      discoverEmergency: async ({ area }) => {
        searched.push(area);
        return [lead('lead1'), lead('lead2', 'Ambulance Response Unit')];
      },
    },
  );

  const prompt = await engine.process('EMERGENCY');
  assert.equal(prompt.state, 'awaiting_emergency_area');
  assert.match(textOf(prompt), /Which area/);
  assert.match(textOf(prompt), /Call 112 now/);

  const first = await engine.process('Ikeja', prompt);
  assert.equal(first.state, 'showing_emergency');
  assert.deepEqual(first.replies, [
    { kind: 'web_lead', id: 'lead1', serviceCode: undefined, areaId: null },
  ]);
  assert.deepEqual(searched, ['Ikeja']);
  assert.deepEqual(emergencyRequests, [{ area: 'Ikeja', count: 2 }]);

  const second = await engine.process('MORE', first);
  assert.equal(second.state, 'showing_emergency');
  assert.equal(second.context.resultIndex, 1);
  assert.equal(second.replies[0].kind, 'web_lead');
  assert.equal(second.replies[0].kind === 'web_lead' && second.replies[0].id, 'lead2');

  const exhausted = await engine.process('MORE', second);
  assert.equal(exhausted.state, 'idle');
  assert.match(textOf(exhausted), /No more emergency results/);
  assert.match(textOf(exhausted), /Call 112 now/);
});

test('EMERGENCY <area> and EMERGENCY near <area> search directly; blank area prompts', async () => {
  const searched: string[] = [];
  const { engine } = setup(
    {
      storeWebLeads: async () => ['lead1'],
      recordEmergencyRequest: async () => {},
    },
    {
      discoverFacilities: async () => [],
      discoverEmergency: async ({ area }) => {
        searched.push(area);
        return [lead('lead1')];
      },
    },
  );
  assert.equal((await engine.process('EMERGENCY Ikeja')).state, 'showing_emergency');
  assert.equal((await engine.process('EMERGENCY near Agege')).state, 'showing_emergency');
  assert.deepEqual(searched, ['Ikeja', 'Agege']);
  assert.equal((await engine.process('EMERGENCY near')).state, 'awaiting_emergency_area');
});

test('EMERGENCY without live results gives safe 112 guidance and never fabricates a facility', async () => {
  const records: Array<{ count: number; area: string }> = [];
  const { engine } = setup(
    {
      storeWebLeads: async () => [],
      recordEmergencyRequest: async (request) => {
        records.push({ count: request.results.length, area: request.location_text });
      },
    },
    {
      discoverFacilities: async () => [],
      discoverEmergency: async () => [],
    },
  );
  const fallback = await engine.process('EMERGENCY Ikeja');
  assert.equal(fallback.state, 'idle');
  assert.equal(fallback.replies[0].kind, 'text');
  assert.match(textOf(fallback), /Call 112 now/);
  assert.match(textOf(fallback), /nearest emergency department/);
  assert.doesNotMatch(textOf(fallback), /Hospital|Clinic/);
  assert.deepEqual(records, [{ count: 0, area: 'Ikeja' }]);
});

test('care FIND falls back to unverified live leads when the directory is empty', async () => {
  const { engine } = setup(
    {
      findFacilities: async () => [],
      storeWebLeads: async () => ['lead1'],
    },
    {
      discoverFacilities: async ({ serviceLabel, area }) => {
        assert.equal(serviceLabel, 'General care');
        assert.equal(area, 'Ikeja');
        return [lead('lead1', 'Live Care Clinic')];
      },
    },
  );
  const result = await engine.process('FIND general near Ikeja');
  assert.equal(result.state, 'showing_results');
  assert.equal(result.context.resultKind, 'web');
  assert.equal(result.replies[0].kind, 'web_lead');
  assert.equal(result.replies[0].kind === 'web_lead' && result.replies[0].id, 'lead1');
});

test('care web fallback uses the chosen area label, not the area id', async () => {
  const searched: string[] = [];
  const { engine } = setup(
    {
      findAreas: async () => [
        { id: 'area-a', name: 'Ikeja', region: 'Lagos' },
        { id: 'area-b', name: 'Ikeja', region: 'Ogun' },
      ],
      findFacilities: async () => [],
      storeWebLeads: async () => ['lead1'],
    },
    {
      discoverFacilities: async ({ area }) => {
        searched.push(area);
        return [lead('lead1', 'Live Care Clinic')];
      },
    },
  );
  const choice = await engine.process('FIND general near Ikeja');
  assert.equal(choice.state, 'awaiting_area_choice');
  const result = await engine.process('1', choice);
  assert.equal(result.state, 'showing_results');
  assert.equal(result.context.resultKind, 'web');
  assert.deepEqual(searched, ['Ikeja, Lagos']);
});
