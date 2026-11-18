import type {
  Area,
  Facility,
  RecordField,
  Service,
  SmsContext,
  SmsReply,
} from '@healthaccess/shared';

export type { Area, Facility, RecordField, Service, SmsContext, SmsReply };

export interface Projection {
  available: boolean;
  fields?: RecordField[];
  read_session_id?: string;
}

export interface WebLead {
  name: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string;
  source_reference: string;
  verification_status: 'unverified';
  service_label: string;
}

export interface SmsConversation {
  state: string;
  context: SmsContext;
}

/** A patient's saved home area, available only through a live profile-use consent. */
export interface SavedArea {
  id: string;
  label: string;
}

/**
 * De-identified, consent-scoped context used to tailor general health answers.
 * Never stored in channel state and never sent to web search.
 */
export interface PersonalHints {
  ageBand: string | null;
  sex: string | null;
  pregnancy: string | null;
  conditions: string[];
  allergies: string[];
  medications: string[];
  language: string;
}
