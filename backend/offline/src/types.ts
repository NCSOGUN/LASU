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
