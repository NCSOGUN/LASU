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

export function renderFacility(facility: Facility | null, serviceLabel?: string) {
  if (!facility)
    return 'This facility is no longer listed. Send FIND <care> near <area> for current results.';
  const distance =
    Number.isFinite(Number(facility.distance_km)) && facility.distance_km !== null
      ? `Approx. ${Number(facility.distance_km).toFixed(1)} km from area centre.`
      : 'Distance unavailable.';
  return `${facility.is_demo ? 'Demo facility (fictional): ' : ''}${facility.name}${serviceLabel ? ` - ${serviceLabel}` : ''}.\n${facility.address}.\n${distance}\n${facility.phone ? `Contact: ${facility.phone}.` : 'Contact not listed.'}\nCall to confirm service availability. Reply MORE for another option.`;
}

export function renderWebLead(
  lead: Pick<WebLead, 'name' | 'address' | 'phone' | 'source_url'> | null,
) {
  if (!lead) return 'That web listing is unavailable. Send a new FIND request.';
  let source;
  try {
    const url = new URL(lead.source_url);
    if (url.protocol !== 'https:') throw new Error('Invalid source');
    source = url.href;
  } catch {
    return 'Web source unavailable. Please contact a local health facility.';
  }
  return `Unverified web listing, NOT a confirmed suitable-care match:\n${lead.name}\n${lead.address}\n${lead.phone ? `Listed phone: ${lead.phone}.` : 'Contact not listed.'}\nSource: ${source}. Call to verify services before travel. Reply MORE for another listing.`;
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
