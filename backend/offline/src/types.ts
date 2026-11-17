export interface Service {
  service_code: string;
  label: string;
}

export interface Area {
  id: string;
  name: string;
  region?: string;
  city?: string;
}

export interface Facility {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  distance_km: number | null;
  service_code?: string;
  is_demo?: boolean;
}

export interface RecordField {
  key: string;
  label: string;
  value: string | string[];
}

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

export type SmsReply =
  | { kind: 'text'; text: string; allowAfterStop?: boolean }
  | { kind: 'emergency'; codeDigest: string }
  | {
      kind: 'facility' | 'web_lead';
      id: string;
      serviceCode?: string;
      areaId?: string | null;
      radiusKm?: number;
    };

export interface SmsContext {
  serviceCode?: string;
  areaId?: string;
  areaIds?: string[];
  consentId?: string | null;
  skipProfile?: boolean;
  resultIds?: string[];
  resultIndex?: number;
  resultKind?: 'directory' | 'web';
}

export interface SmsConversation {
  state: string;
  context: SmsContext;
}
