import type { Config } from '../config.js';
import type { Crypto } from '../security/crypto.js';
import type {
  Area,
  Facility,
  Projection,
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
  storeWebLeads(leads: WebLead[]): Promise<string[]>;
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
    answer(question: string): Promise<{ text: string }>;
  };
  search?: {
    discoverFacilities(request: { serviceLabel: string; area: string }): Promise<WebLead[]>;
  };
  crypto: Pick<Crypto, 'digestCode'>;
  config: Pick<Config, 'profileUseEnabled' | 'searchRadiusKm' | 'allowLiveWeb'>;
}

export interface SmsResult extends SmsConversation {
  replies: SmsReply[];
}

export const HELP =
  'HealthAccess: FIND <care> near <area>; LOOKUP <12-digit patient code>; ASK <general health question>; MORE; CANCEL; STOP. AI-assisted information is not a diagnosis. English only.';
export const UNAVAILABLE = 'No shared summary is available for that code. Check the code.';
export const URGENT =
  'If this may be an emergency, seek immediate in-person medical help. Do not wait for an SMS reply. HealthAccess does not dispatch an ambulance.';

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
  return /\b(can['\u2019]?t breathe|cannot breathe|can not breathe|difficulty breathing|unconscious|severe bleeding|heavy bleeding|overdose|kill myself|suicid(?:e|al)|chest pain)\b/i.test(
    text,
  );
}

export function createSmsEngine({
  repository,
  assistant,
  search,
  crypto,
  config,
}: SmsDependencies) {
  const textReply = (text: string): SmsReply => ({ kind: 'text', text });
  const result = (state: string, context: SmsContext, replies: SmsReply[]): SmsResult => ({
    state,
    context,
    replies,
  });
  const idle = (text: string) => result('idle', {}, [textReply(text)]);

  async function showResult(context: SmsContext, index = 0): Promise<SmsResult> {
    if (index >= (context.resultIds || []).length) {
      return result('awaiting_area', { serviceCode: context.serviceCode }, [
        textReply(
          'No more suitable results. Enter another area, or start again with FIND <care> near <area>.',
        ),
      ]);
    }
    return result('showing_results', { ...context, resultIndex: index }, [
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
    if (!query && !context.areaId)
      return result('awaiting_area', { serviceCode }, [
        textReply('Which current area or nearby landmark are you in?'),
      ]);
    const areas = context.areaId
      ? [{ id: context.areaId, name: '' }]
      : await repository.findAreas(query!);
    if (areas.length > 1) {
      const choices = areas.slice(0, 3);
      return result('awaiting_area_choice', { serviceCode, areaIds: choices.map((a) => a.id) }, [
        textReply(
          `Choose an area: ${choices.map((a, i) => `${i + 1}. ${a.name}, ${a.region || a.city || ''}`).join('; ')}. Reply with a number.`,
        ),
      ]);
    }
    if (!areas.length) return webFallback(serviceCode, query);
    const areaId = areas[0].id;
    let consentId = context.consentId || null;
    if (config.profileUseEnabled && !confirmProfile && !context.skipProfile) {
      const consent = await repository.findProfileConsent();
      if (consent)
        return result(
          'awaiting_profile_confirmation',
          { serviceCode, areaId, consentId: consent.id },
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
      if (query) return webFallback(serviceCode, query);
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

  async function process(
    message: string,
    conversation: SmsConversation = { state: 'idle', context: {} },
  ): Promise<SmsResult> {
    const text = message.trim();
    const { state, context = {} } = conversation;
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
    if (/^HELP$/i.test(text)) return idle(HELP);
    if (isPotentiallyUrgent(text)) return idle(URGENT);
    if (/^LOOKUP(?:\s|$)/i.test(text)) {
      const match = /^LOOKUP\s+(\d{12})$/i.exec(text);
      if (!match)
        return idle(
          'Use LOOKUP followed by your 12-digit patient code. Temporary access codes work in USSD only.',
        );
      const codeDigest = crypto.digestCode(match[1]);
      if (!codeDigest) return idle(UNAVAILABLE);
      const projection = await repository.readEmergency(codeDigest);
      if (!projection?.available || !projection.fields?.length) return idle(UNAVAILABLE);
      // Re-resolve in the sending worker; a queued record is not an authorization snapshot.
      return result('idle', {}, [{ kind: 'emergency', codeDigest }]);
    }
    if (/\d{6,}/.test(text))
      return idle(
        'Do not send access codes or phone numbers in a health question. Use LOOKUP <12-digit patient code> for a summary.',
      );
    if (/^MORE$/i.test(text)) {
      return state === 'showing_results'
        ? showResult(context, (context.resultIndex || 0) + 1)
        : idle('There is no active result list. Send FIND <care> near <area>.');
    }
    const services = await repository.listServices();
    const find = /^FIND(?:\s+(.+?))?(?:\s+near\s+(.+))?$/i.exec(text);
    if (find) return findCare(resolveService(find[1] || '', services), find[2] || null);
    if (/^ASK(?:\s|$)/i.test(text)) {
      const question = text.replace(/^ASK\s*/i, '');
      if (!question)
        return idle(
          'Send ASK followed by a general health question. Do not include names, codes or private records.',
        );
      const answer = await assistant.answer(question);
      return idle(answer.text);
    }
    if (state === 'awaiting_profile_confirmation') {
      if (!/^(YES|NO)$/i.test(text))
        return result(state, context, [textReply('Reply YES or NO, or CANCEL.')]);
      return findCare(
        context.serviceCode,
        null,
        { ...context, skipProfile: /^NO$/i.test(text) },
        /^YES$/i.test(text),
      );
    }
    if (state === 'awaiting_service') {
      const selected = /^\d+$/.test(text)
        ? services[Number(text) - 1]?.service_code
        : resolveService(text, services);
      return findCare(selected, null);
    }
    if (state === 'awaiting_area') return findCare(context.serviceCode, text);
    if (state === 'awaiting_area_choice') {
      const selected = /^\d+$/.test(text) ? context.areaIds?.[Number(text) - 1] : undefined;
      if (!selected)
        return result(state, context, [
          textReply('Reply with one of the offered area numbers, or CANCEL.'),
        ]);
      return findCare(context.serviceCode, null, { areaId: selected });
    }
    const interpreted = await assistant.classify(text, { services });
    if (interpreted.intent === 'find_care') {
      const service = services.some((s) => s.service_code === interpreted.service_code)
        ? interpreted.service_code
        : null;
      return findCare(service, interpreted.location_query);
    }
    if (interpreted.intent === 'health_question') return idle((await assistant.answer(text)).text);
    return idle(interpreted.question || HELP);
  }
  return { process };
}
