import { PractitionerRecordScreen } from "@/features/practitioner/PractitionerRecordScreen";

export const metadata = { title: "Shared record · HealthAccess" };
// The read session id is runtime data; this route must render on request rather than prerender the shell.
export const instant = false;

export default async function PractitionerRecordPage({ params }: { params: Promise<{ readSessionId: string }> }) {
  const { readSessionId } = await params;
  return <PractitionerRecordScreen id={readSessionId} />;
}
