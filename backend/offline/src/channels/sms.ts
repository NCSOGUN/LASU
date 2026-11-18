import type { Config } from '../config.js';
import type { Crypto } from '../security/crypto.js';
import type {
  Area,
  Facility,
  OwnCodes,
  PersonalHints,
  QuickGrantResult,
  Projection,
  SavedArea,
  Service,
  SmsContext,
  SmsConversation,
  SmsReply,
  WebLead,
} from '../types.js';

export interface SmsRepository {
  listServices(): Promise<Service[]>;
  findAreas(query: string): Promise<Area[]>;
  findFacilities(service: string, areaId: string, radius: number): Promise<Facility[]>;
  readEmergency(digest: string): Promise<Projection>;
  findProfileConsent(): Promise<{ id: string } | null>;
  readMatchingContext(consentId: string): Promise<{ available: boolean }>;
  setOptOut(optOut: boolean): Promise<void>;
  /** Linked patient's home area (live consent only). */
  findSavedArea?(): Promise<SavedArea | null>;
  /** Consent-scoped, de-identified hints for tailoring answers (live consent only). */
  readPersonalHints?(): Promise<PersonalHints | null>;
  /** The sender's own emergency code, when the phone is verified to a patient. */
  readOwnCodes?(): Promise<OwnCodes>;
  /** One-tap temporary code for the sender's emergency information. */
  createQuickGrant?(minutes?: number): Promise<QuickGrantResult>;
  storeWebLeads(leads: WebLead[]): Promise<string[]>;
  recordEmergencyRequest?(request: {
    channel: 'SMS' | 'USSD';
    area_id: string | null;
    location_text: string;
    results: WebLead[];
  }): Promise<void>;
  recordReferral?(referral: {
    serviceCode: string;
    areaId: string;
    facilities: Facility[];
    consentId: string | null;
  }): Promise<void>;
}

interface SmsDependencies {
  repository: SmsRepository;
  assistant: {
    classify(
      message: string,
      context: { services: Service[] },
    ): Promise<{
      intent: string;
      service_code: string | null;
      location_query: string | null;
      question: string | null;
    }>;
    answer(
      question: string,
      options?: { personal?: PersonalHints | null },
    ): Promise<{ text: string; kind?: string }>;
    converse?(
      message: string,
      options: {
        services: Service[];
        history: Array<{ role: 'user' | 'assistant'; text: string }>;
        savedAreaLabel: string | null;
      },
    ): Promise<{
      intent: string;
      service_code: string | null;
      location_query: string | null;
      question: string | null;
      reply: string | null;
    } | null>;
  };
  search?: {
    discoverFacilities(request: { serviceLabel: string; area: string }): Promise<WebLead[]>;
    discoverEmergency?(request: { area: string }): Promise<WebLead[]>;
  };
  crypto: Pick<Crypto, 'digestCode'>;
  config: Pick<Config, 'profileUseEnabled' | 'searchRadiusKm' | 'allowLiveWeb'>;
}

export interface SmsResult extends SmsConversation {
  replies: SmsReply[];
}

export const HELP =
  'HealthAccess can help. Reply with a number: 1 Find a clinic or hospital, 2 Emergency help, 3 Ask a health question, 4 Get my access code. Or just tell me what is wrong. In danger? Call 112.';
export const GREETING =
  'Hi, I am HealthAccess. Tell me what is wrong or what you need, for example "fever since yesterday" or "clinic in Ikeja". Or reply 1 Find care, 2 Emergency, 3 Ask a question, 4 My access code.';
export const NOT_LINKED =
  'This phone is not linked to a HealthAccess account yet. Sign in on the HealthAccess website, open Channels and verify this number, then reply CODE again.';
export const UNAVAILABLE = 'No shared summary is available for that code. Check the code.';
export const URGENT =
  'This may be an emergency. Get immediate in-person help: call 112 now or go to the nearest emergency department. Reply with your area (e.g. Ikeja) and I will send the nearest emergency hospital, or send EMERGENCY <area>.';
export const EMERGENCY_FALLBACK =
  'No live emergency listing found. Call 112 now or go to the nearest emergency department. HealthAccess does not dispatch ambulances.';

const aliases: Record<string, string[]> = {
  general: ['general', 'general care', 'general medicine', 'doctor'],
  pediatrics: ['pediatrics', 'paediatrics', 'child', 'child health', 'children', 'baby'],
  maternity: ['maternity', 'maternity care', 'pregnancy', 'antenatal'],
};

export function resolveService(text: string, services: Service[]) {
  const normalized = text.toLowerCase().trim();
  const matches = services.filter((service) =>
    [service.service_code, service.label, ...(aliases[service.service_code] || [])].some((alias) =>
      new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalized),
    ),
  );
  return matches.length === 1 ? matches[0].service_code : null;
}

export function isPotentiallyUrgent(text: string) {
  // Conservative routing only, not clinical triage or a claim of reviewed advice.
  return [
    /\b(?:can['\u2019]?t|cannot|can not|unable to|struggling to|hard to|difficult to) breathe?\b/i,
    /\b(?:difficulty|trouble|problems?|issues?|struggling|hard|pain) (?:with |when |while )?breathing\b/i,
    /\bbreathing (?:problems?|issues?|difficult(?:y|ies)|trouble|hard|fast|badly)\b/i,
    /\bshort(?:ness)? of breath\b|\bgasping\b|\bchoking\b/i,
    /\bchest (?:pain|tightness|is tight|hurts)\b/i,
    /\b(?:unconscious|not waking|passed out|fainted|collapsed|unresponsive)\b/i,
    /\b(?:seizure|convulsion|convulsing|fitting)s?\b/i,
    /\b(?:stroke|face drooping|slurred speech)\b/i,
    /\b(?:severe|heavy|a lot of|won['\u2019]?t stop) bleeding\b|\bbleeding (?:a lot|heavily|won['\u2019]?t stop)\b/i,
    /\b(?:overdose|poison(?:ed|ing)?|snake ?bite)\b/i,
    /\b(?:kill myself|end my life|suicid(?:e|al))\b/i,
    /\bnot breathing\b|\b(?:baby|child)(?: is)? (?:not moving|blue|turning blue)\b/i,
  ].some((pattern) => pattern.test(text));
}

export function createSmsEngine({
  repository,
  assistant,
  search,
  crypto,
  config,
}: SmsDependencies) {
  type AreaContext = SmsContext & { areaLabel?: string; areaLabels?: string[] };
  const areaContext = (context: SmsContext) => context as AreaContext;
  const areaText = (area: Area) => {
    const suffix = area.city || area.region;
    return suffix && suffix !== area.name ? `${area.name}, ${suffix}` : area.name;
  };
  const textReply = (text: string): SmsReply => ({ kind: 'text', text });
  const result = (state: string, context: SmsContext, replies: SmsReply[]): SmsResult => ({
    state,
    context,
    replies,
  });
  const idle = (text: string) => result('idle', {}, [textReply(text)]);

  async function savedArea(): Promise<SavedArea | null> {
    try {
      return (await repository.findSavedArea?.()) ?? null;
    } catch {
      return null;
    }
  }

  async function personalHints(): Promise<PersonalHints | null> {
    try {
      return (await repository.readPersonalHints?.()) ?? null;
    } catch {
      // Personalisation is best-effort; a general answer is still safe.
      return null;
    }
  }

  async function answerQuestion(question: string): Promise<SmsResult> {
    const answer = await assistant.answer(question, { personal: await personalHints() });
    return idle(answer.text);
  }

  async function showResult(
    context: SmsContext,
    index = 0,
    stateName = 'showing_results',
  ): Promise<SmsResult> {
    if (index >= (context.resultIds || []).length) {
      if (stateName === 'showing_emergency') {
        return idle(
          'No more emergency results. Call 112 now if life-threatening, or go to the nearest emergency department. Reply EMERGENCY <area> to search again.',
        );
      }
      return result('awaiting_area', { serviceCode: context.serviceCode }, [
        textReply(
          'No more suitable results. Enter another area, or start again with FIND <care> near <area>.',
        ),
      ]);
    }
    return result(stateName, { ...context, resultIndex: index }, [
      {
        kind: context.resultKind === 'web' ? 'web_lead' : 'facility',
        id: context.resultIds![index],
        serviceCode: context.serviceCode,
        areaId: context.areaId || null,
      },
    ]);
  }

  async function findCare(
    serviceCode: string | null | undefined,
    query: string | null | undefined,
    context: SmsContext = {},
    confirmProfile = false,
  ): Promise<SmsResult> {
    const services = await repository.listServices();
    if (!serviceCode) {
      return result('awaiting_service', {}, [
        textReply(
          `Which care? ${services.map((s, i) => `${i + 1}. ${s.label}`).join(' ')} Reply with a number. I will then ask for your area.`,
        ),
      ]);
    }
    if (!query && !context.areaId) {
      const saved = await savedArea();
      if (saved)
        return result(
          'awaiting_area',
          { serviceCode, suggestedAreaId: saved.id, suggestedAreaLabel: saved.label },
          [
            textReply(
              `Search near ${saved.label} (your saved area)? Reply YES, or send the area or landmark you are in now.`,
            ),
          ],
        );
      return result('awaiting_area', { serviceCode }, [
        textReply('Which current area or nearby landmark are you in?'),
      ]);
    }
    const areas = context.areaId
      ? [{ id: context.areaId, name: '' }]
      : await repository.findAreas(query!);
    if (areas.length > 1) {
      const choices = areas.slice(0, 3);
      return result(
        'awaiting_area_choice',
        {
          serviceCode,
          areaIds: choices.map((a) => a.id),
          areaLabels: choices.map(areaText),
        } as SmsContext,
        [
          textReply(
            `Choose an area: ${choices.map((a, i) => `${i + 1}. ${a.name}, ${a.region || a.city || ''}`).join('; ')}. Reply with a number.`,
          ),
        ],
      );
    }
    if (!areas.length) return webFallback(serviceCode, query);
    const areaId = areas[0].id;
    const areaLabel = (context.areaId ? areaContext(context).areaLabel : null) || areaText(areas[0]);
    let consentId = context.consentId || null;
    if (config.profileUseEnabled && !confirmProfile && !context.skipProfile) {
      const consent = await repository.findProfileConsent();
      if (consent)
        return result(
          'awaiting_profile_confirmation',
          { serviceCode, areaId, consentId: consent.id, areaLabel } as SmsContext,
          [
            textReply(
              'Use the profile scope you previously permitted for this search? Reply YES or NO. No profile details will be sent by SMS.',
            ),
          ],
        );
    }
    if (confirmProfile && consentId) {
      // Do not retain clinical values in channel state or send them to models/search.
      const permitted = await repository.readMatchingContext(consentId);
      if (!permitted?.available) consentId = null;
    } else consentId = null;
    const facilities = await repository.findFacilities(serviceCode, areaId, config.searchRadiusKm);
    if (!facilities.length) {
      if (query || areaLabel) return webFallback(serviceCode, areaLabel || query);
      return result('awaiting_area', { serviceCode }, [
        textReply(
          'No suitable facility is listed for that area. Try another area. A nearby facility is not necessarily suitable.',
        ),
      ]);
    }
    // Referral telemetry must not hide an otherwise valid directory result.
    try {
      await repository.recordReferral?.({ serviceCode, areaId, facilities, consentId });
    } catch {
      // The user-facing result still comes from the approved directory response.
    }
    return showResult({
      serviceCode,
      areaId,
      resultIds: facilities.map((f) => f.id),
      resultKind: 'directory',
    });
  }

  async function webFallback(
    serviceCode: string,
    area: string | null | undefined,
  ): Promise<SmsResult> {
    if (config.allowLiveWeb && search && area) {
      try {
        const services = await repository.listServices();
        const serviceLabel = services.find((s) => s.service_code === serviceCode)?.label;
        if (serviceLabel) {
          const leads = await search.discoverFacilities({ serviceLabel, area });
          const ids = await repository.storeWebLeads(leads);
          if (ids.length) return showResult({ serviceCode, resultIds: ids, resultKind: 'web' });
        }
      } catch {
        /* A failed web search never becomes a fabricated directory result. */
      }
    }
    return result('awaiting_area', { serviceCode }, [
      textReply(
        'No suitable facility is listed for that area. Try another area or landmark. Service availability cannot be confirmed.',
      ),
    ]);
  }

  function validEmergencyArea(value: string): boolean {
    const area = value.trim();
    return area.length > 0 && area.length <= 64 && /[\p{L}]/u.test(area) && !/^\d+$/.test(area);
  }

  async function emergencySearch(area: string, note?: string): Promise<SmsResult> {
    let leads: WebLead[] = [];
    if (config.allowLiveWeb && search?.discoverEmergency) {
      try {
        leads = (await search.discoverEmergency({ area })).slice(0, 8);
      } catch {
        leads = [];
      }
    }
    try {
      await repository.recordEmergencyRequest?.({
        channel: 'SMS',
        area_id: null,
        location_text: area,
        results: leads,
      });
    } catch {
      // Telemetry is best-effort and must not hide emergency guidance.
    }
    if (!leads.length) return idle(EMERGENCY_FALLBACK);
    let ids: string[];
    try {
      ids = await repository.storeWebLeads(leads);
    } catch {
      return idle(EMERGENCY_FALLBACK);
    }
    if (!ids.length) return idle(EMERGENCY_FALLBACK);
    const shown = await showResult({ resultIds: ids, resultKind: 'web' }, 0, 'showing_emergency');
    return note ? { ...shown, replies: [textReply(note), ...shown.replies] } : shown;
  }

  type Turn = { role: 'user' | 'assistant'; text: string };
  const HISTORY_TURNS = 10;
  const historyText = (value: string) =>
    value
      .replace(/\d[\d\s-]{4,}\d/g, '[number]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);

  function replyText(reply: SmsReply): string {
    if (reply.kind === 'text') return reply.text;
    if (reply.kind === 'emergency') return '[sent the emergency summary]';
    return '[sent a care listing]';
  }

  const grouped = (code: string) => code.replace(/(\d{4})(?=\d)/g, '$1 ');

  async function myCode(): Promise<SmsResult> {
    let codes: OwnCodes = { linked: false };
    try {
      codes = (await repository.readOwnCodes?.()) ?? { linked: false };
    } catch {
      return idle('Your code is unavailable right now. Please try again shortly.');
    }
    if (!codes.linked) return idle(NOT_LINKED);
    return result('idle', {}, [
      textReply(
        codes.summaryFields === 0
          ? `Your HealthAccess emergency code is ${grouped(codes.patientCode)}. It shows nothing yet: choose your emergency summary on the HealthAccess website. Reply NEW CODE for a 1-hour code with your emergency details.`
          : `Your HealthAccess emergency code is ${grouped(codes.patientCode)}. Anyone you give it to can see your emergency information. Reply NEW CODE for a code that expires in 1 hour.`,
      ),
    ]);
  }

  async function newCode(): Promise<SmsResult> {
    let created: QuickGrantResult = { status: 'not_linked' };
    try {
      created = (await repository.createQuickGrant?.(60)) ?? { status: 'not_linked' };
    } catch {
      return idle('A new code could not be created right now. Please try again shortly.');
    }
    if (created.status === 'not_linked') return idle(NOT_LINKED);
    if (created.status === 'nothing_to_share')
      return idle('Add your health information on the HealthAccess website first, then reply NEW CODE.');
    return idle(
      `Your 1-hour HealthAccess code is ${grouped(created.code)}. Give it to your doctor or nurse. It opens your emergency information by USSD or on the website.`,
    );
  }

  async function urgent(note = URGENT): Promise<SmsResult> {
    const saved = await savedArea();
    if (saved)
      return emergencySearch(
        saved.label,
        `This may be an emergency: call 112 now or go to the nearest emergency department. Searching near your saved area, ${saved.label}. Send EMERGENCY <area> if you are elsewhere.`,
      );
    return result('awaiting_emergency_area', {}, [textReply(note)]);
  }

  async function startEmergency(): Promise<SmsResult> {
    const saved = await savedArea();
    if (saved)
      return emergencySearch(
        saved.label,
        `Searching near your saved area, ${saved.label}. Call 112 now if life-threatening. Send EMERGENCY <area> if you are somewhere else.`,
      );
    return result('awaiting_emergency_area', {}, [
      textReply('Which area or nearby landmark are you in? Call 112 now if the situation is life-threatening.'),
    ]);
  }

  const MENU_PATTERN =
    /^(?:help|menu|options?|start|\?+|what\??|huh\??|i don['’]?t understand|i do not understand|don['’]?t understand|confused|what can you do\??)$/i;
  const GREETING_PATTERN =
    /^(?:hi+|hello+|hey+|hallo|good (?:morning|afternoon|evening|day)|howdy|how far|bawo|sannu|ndewo)[!. ]*$/i;
  const THANKS_PATTERN = /^(?:thanks?|thank you|ok(?:ay)?|alright|cool|great)[!. ]*$/i;

  async function process(
    message: string,
    conversation: SmsConversation = { state: 'idle', context: {} },
  ): Promise<SmsResult> {
    const history: Turn[] = Array.isArray(conversation.context?.history)
      ? (conversation.context.history as Turn[]).slice(-HISTORY_TURNS)
      : [];
    const out = await route(message, conversation, history);
    if (out.state === 'closed') return out;
    const turns: Turn[] = [
      ...history,
      { role: 'user' as const, text: historyText(message) },
      { role: 'assistant' as const, text: historyText(out.replies.map(replyText).join(' ')) },
    ].filter((turn) => turn.text);
    return { ...out, context: { ...out.context, history: turns.slice(-HISTORY_TURNS) } };
  }

  async function route(
    message: string,
    conversation: SmsConversation,
    history: Turn[],
  ): Promise<SmsResult> {
    const text = message.trim();
    const { state } = conversation;
    const { history: _history, historyEnvelope: _envelope, ...context } = conversation.context ?? {};
    if (/^(CANCEL|STOP)$/i.test(text)) {
      if (/^STOP$/i.test(text)) await repository.setOptOut(true);
      return result('closed', {}, [
        {
          kind: 'text',
          allowAfterStop: true,
          text: 'Current interaction ended. A future message from you starts a new request. No unsolicited health messages will be sent.',
        },
      ]);
    }
    await repository.setOptOut(false);
    if (MENU_PATTERN.test(text)) return result('menu', {}, [textReply(HELP)]);
    if (isPotentiallyUrgent(text)) return urgent();
    if (/^LOOKUP(?:\s|$)/i.test(text)) {
      const code = text.replace(/^LOOKUP\s*/i, '').replace(/[\s-]/g, '');
      if (/^\d{8}$/.test(code))
        return idle(
          'That is a 1-hour access code. Dial the HealthAccess USSD code and choose 2 (Open shared health info), or enter it on the HealthAccess website.',
        );
      if (!/^\d{12}$/.test(code))
        return idle('Send LOOKUP followed by the 12-digit emergency code, for example LOOKUP 1234 5678 9012.');
      const codeDigest = crypto.digestCode(code);
      if (!codeDigest) return idle(UNAVAILABLE);
      const projection = await repository.readEmergency(codeDigest);
      if (!projection?.available || !projection.fields?.length) return idle(UNAVAILABLE);
      // Re-resolve in the sending worker; a queued record is not an authorization snapshot.
      return result('idle', {}, [{ kind: 'emergency', codeDigest }]);
    }
    if (/^(?:MY\s+)?(?:ACCESS\s+|PATIENT\s+|EMERGENCY\s+)?CODE$/i.test(text)) return myCode();
    if (/^NEW\s+CODE$/i.test(text)) return newCode();
    if (/\d{6,}/.test(text.replace(/[\s-]/g, '')) && /\d{3,}[\s-]?\d{3,}/.test(text))
      return idle(
        'Please do not send codes or phone numbers in a question. To view someone\'s emergency information, send LOOKUP <12-digit code>.',
      );
    if (/^MORE$/i.test(text)) {
      return state === 'showing_results' || state === 'showing_emergency'
        ? showResult(context, (context.resultIndex || 0) + 1, state)
        : idle('There is no active result list. Tell me what care you need and where, for example "clinic in Ikeja".');
    }
    const emergency = /^EMERGENCY\b\s*(.*)$/i.exec(text);
    if (emergency) {
      const area = emergency[1].replace(/^near\b\s*/i, '').trim();
      if (!area) return startEmergency();
      if (!validEmergencyArea(area))
        return result('awaiting_emergency_area', {}, [
          textReply('Reply with your area or a nearby landmark. Call 112 now if life-threatening.'),
        ]);
      return emergencySearch(area);
    }
    if (state === 'awaiting_emergency_area') {
      if (/^(YES|Y)$/i.test(text)) return startEmergency();
      if (!validEmergencyArea(text))
        return result(state, {}, [
          textReply('Reply with your area or a nearby landmark. Call 112 now if life-threatening.'),
        ]);
      return emergencySearch(text);
    }
    const services = await repository.listServices();
    const find = /^FIND(?:\s+(.+?))?(?:\s+(?:near|in|at)\s+(.+))?$/i.exec(text);
    if (find) return findCare(resolveService(find[1] || '', services), find[2] || null);
    if (/^ASK(?:\s|$)/i.test(text)) {
      const question = text.replace(/^ASK\s*/i, '');
      if (!question)
        return result('awaiting_question', {}, [
          textReply('What would you like to ask? Describe the symptom or question in one message.'),
        ]);
      return answerQuestion(question);
    }
    if (state === 'menu' && /^[1-4]$/.test(text)) {
      if (text === '1') return findCare(null, null);
      if (text === '2') return startEmergency();
      if (text === '3')
        return result('awaiting_question', {}, [
          textReply('What would you like to ask? Describe the symptom or question in one message.'),
        ]);
      return myCode();
    }
    if (state === 'awaiting_question') return answerQuestion(text);
    if (state === 'awaiting_profile_confirmation') {
      if (!/^(YES|NO|Y|N)$/i.test(text))
        return result(state, context, [textReply('Reply YES or NO, or CANCEL.')]);
      return findCare(
        context.serviceCode,
        null,
        { ...context, skipProfile: /^NO?$/i.test(text) },
        /^Y(ES)?$/i.test(text),
      );
    }
    if (state === 'awaiting_service') {
      const selected = /^\d+$/.test(text)
        ? services[Number(text) - 1]?.service_code
        : resolveService(text, services);
      if (selected || /^\d+$/.test(text)) return findCare(selected, null);
    }
    if (state === 'awaiting_area' && text.length <= 64 && !/\?$/.test(text)) {
      if (/^(YES|Y)$/i.test(text) && context.suggestedAreaId)
        return findCare(context.serviceCode, null, {
          areaId: context.suggestedAreaId,
          areaLabel: context.suggestedAreaLabel,
        } as SmsContext);
      return findCare(context.serviceCode, text);
    }
    if (state === 'awaiting_area_choice') {
      const index = Number(text) - 1;
      const selected = /^\d+$/.test(text) ? context.areaIds?.[index] : undefined;
      if (!selected)
        return result(state, context, [
          textReply('Reply with one of the offered area numbers, or CANCEL.'),
        ]);
      return findCare(context.serviceCode, null, {
        areaId: selected,
        areaLabel: areaContext(context).areaLabels?.[index],
      } as SmsContext);
    }
    if (GREETING_PATTERN.test(text)) return result('menu', {}, [textReply(GREETING)]);
    if (THANKS_PATTERN.test(text))
      return idle('You are welcome. Message me any time you need care or have a health question. In danger? Call 112.');

    if (assistant.converse) {
      const saved = await savedArea();
      const reply = await assistant.converse(text, {
        services,
        history,
        savedAreaLabel: saved?.label ?? null,
      });
      if (reply) {
        if (reply.intent === 'emergency') {
          if (reply.location_query && validEmergencyArea(reply.location_query))
            return emergencySearch(reply.location_query, reply.reply ?? undefined);
          return urgent(reply.reply ?? URGENT);
        }
        if (reply.intent === 'find_care') {
          const service =
            reply.service_code ??
            (reply.location_query && services.some((item) => item.service_code === 'general')
              ? 'general'
              : null);
          if (!service || reply.location_query) return findCare(service, reply.location_query);
          if (reply.reply) return result('awaiting_area', { serviceCode: service }, [textReply(reply.reply)]);
          return findCare(service, null);
        }
        if (reply.intent === 'health_question') {
          const answer = await assistant.answer(reply.question ?? text, { personal: await personalHints() });
          if ((answer as { kind?: string }).kind === 'fallback' && reply.reply)
            return idle(`${reply.reply} This is general information, not a diagnosis.`);
          return idle(answer.text);
        }
        if (reply.intent === 'my_code') return myCode();
        if (reply.reply) return result('menu', {}, [textReply(reply.reply)]);
      }
      return result('menu', {}, [textReply(HELP)]);
    }

    const interpreted = await assistant.classify(text, { services });
    if (interpreted.intent === 'find_care') {
      const service = services.some((s) => s.service_code === interpreted.service_code)
        ? interpreted.service_code
        : null;
      return findCare(service, interpreted.location_query);
    }
    if (interpreted.intent === 'health_question') return answerQuestion(text);
    return interpreted.question ? idle(interpreted.question) : result('menu', {}, [textReply(HELP)]);
  }
  return { process };
}
