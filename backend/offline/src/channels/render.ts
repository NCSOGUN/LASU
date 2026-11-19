import type { Facility, RecordField, WebLead } from '../types.js';

const labels: Record<string, string> = {
  full_name: 'Name',
  date_of_birth: 'Date of birth',
  allergies: 'Allergies',
  current_medications: 'Medications',
  conditions: 'Conditions',
  blood_group: 'Blood group',
  emergency_contact_name: 'Contact name',
  emergency_contact_phone: 'Contact phone',
};

export function fieldText(fields: RecordField[]) {
  return fields
    .map((field) => {
      const value = Array.isArray(field.value) ? field.value.join(', ') : String(field.value);
      return `${labels[field.key] || field.label || field.key}: ${value}`;
    })
    .join('\n');
}

export interface ListingContext {
  index?: number;
  total?: number;
  emergency?: boolean;
}

/** Tidy a web address for SMS: drop postcodes, the country and repeated parts. */
export function tidyAddress(address: string): string {
  const parts: string[] = [];
  for (const [position, raw] of address.split(',').entries()) {
    // Only a number trailing a later place segment ("Lagos 100211") is a postcode;
    // house and plot numbers ("Plot 123456 Admiralty Way") are kept.
    const part = (position === 0 ? raw : raw.replace(/\s+\d{5,6}\s*$/, ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (/^\d{5,6}$/.test(part) && position > 0) continue;
    if (!part || /^nigeria$/i.test(part)) continue;
    if (parts.some((existing) => existing.toLowerCase() === part.toLowerCase())) continue;
    parts.push(part);
  }
  // "1, Veta Close" reads better as "1 Veta Close".
  return parts.join(', ').replace(/^(\d+[A-Za-z]?), /, '$1 ');
}

function tidyName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:Ltd\.?|Limited|LLC|Plc)\b/gi, '')
    .trim();
}

function heading(context: ListingContext, name: string): string {
  const position =
    context.total && context.total > 1 && context.index !== undefined
      ? ` ${context.index + 1} of ${context.total}`
      : '';
  if (!position && context.total === 1)
    return `${context.emergency ? 'Nearest emergency option' : 'Nearest option'}: ${name}`;
  return `${context.emergency ? 'Emergency' : 'Option'}${position}: ${name}`;
}

function nextStep(context: ListingContext): string {
  // Older queued replies carry no position; assume more may follow rather than
  // wrongly telling the person the list is finished.
  const more =
    context.total === undefined || context.index === undefined || context.index + 1 < context.total;
  if (context.emergency)
    return more ? 'Life-threatening? Call 112 now. Reply MORE for another.' : 'Life-threatening? Call 112 now.';
  return more ? 'Reply MORE for another option.' : 'Reply with another area to search again.';
}

export function renderFacility(
  facility: Facility | null,
  serviceLabel?: string,
  context: ListingContext = {},
) {
  if (!facility)
    return 'That clinic is no longer listed. Tell me the care you need and your area, and I will search again.';
  const lines = [
    heading(context, `${facility.is_demo ? '(Demo) ' : ''}${facility.name}${serviceLabel ? ` (${serviceLabel})` : ''}`),
    tidyAddress(facility.address),
  ];
  if (Number.isFinite(Number(facility.distance_km)) && facility.distance_km !== null)
    lines.push(`About ${Number(facility.distance_km).toFixed(1)} km away`);
  lines.push(facility.phone ? `Call: ${facility.phone}` : 'No phone number listed.');
  lines.push('From the HealthAccess directory. Call ahead to check they are open.');
  lines.push(nextStep(context));
  return lines.join('\n');
}

export function renderWebLead(
  lead: Pick<WebLead, 'name' | 'address' | 'phone' | 'source_url'> | null,
  context: ListingContext = {},
) {
  if (!lead) return 'That listing is no longer available. Tell me your area and I will search again.';
  let source;
  try {
    const url = new URL(lead.source_url);
    if (url.protocol !== 'https:') throw new Error('Invalid source');
    source = url.href;
  } catch {
    return 'That listing has no valid source. Please contact a local health facility.';
  }
  return [
    heading(context, tidyName(lead.name)),
    tidyAddress(lead.address),
    lead.phone ? `Call: ${lead.phone}` : 'No phone number listed.',
    `Map: ${source}`,
    context.emergency
      ? 'Found online, not checked by us.'
      : 'Found online, not checked by us. Call first to confirm they can help.',
    nextStep(context),
  ].join('\n');
}

// Segments are submitted as one message, leaving concatenation to the provider.
// Reject overflow rather than silently truncating clinical content or dropping fields.
export function smsSegments(text: string) {
  const basic =
    '@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !"#\u00a4%&\'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0';
  const extended = '^{}\\[~]|\u20ac\f';
  let septets = 0;
  let gsm = true;
  for (const character of text) {
    if (basic.includes(character)) septets += 1;
    else if (extended.includes(character)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  const units = gsm ? septets : text.length;
  return {
    encoding: gsm ? 'GSM-7' : 'UCS-2',
    segments: units <= (gsm ? 160 : 70) ? 1 : Math.ceil(units / (gsm ? 153 : 67)),
  };
}
