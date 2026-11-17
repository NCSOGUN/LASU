import { PractitionerRecordScreen } from "@/features/practitioner/PractitionerRecordScreen";

export const metadata = { title: "Shared record · HealthAccess" };

export default async function PractitionerRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PractitionerRecordScreen id={id} />;
}
