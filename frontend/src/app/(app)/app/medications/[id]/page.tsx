import type { Metadata } from "next";
import { MedicationSchedule } from "@/features/medications/MedicationSchedule";

export const metadata: Metadata = { title: "Medication schedule · HealthAccess" };
// The shell reads usePathname, so this owner-only route cannot prerender a static shell.
export const instant = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MedicationSchedule id={id} />;
}
