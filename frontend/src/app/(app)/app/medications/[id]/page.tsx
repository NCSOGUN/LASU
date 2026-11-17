import type { Metadata } from "next";
import { MedicationSchedule } from "@/features/medications/MedicationSchedule";

export const metadata: Metadata = { title: "Medication schedule · HealthAccess" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MedicationSchedule id={id} />;
}
