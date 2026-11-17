import type { Metadata } from "next";
import { MedicationsPage } from "@/features/medications/MedicationsPage";

export const metadata: Metadata = { title: "Medications · HealthAccess" };

export default function Page() {
  return <MedicationsPage />;
}
