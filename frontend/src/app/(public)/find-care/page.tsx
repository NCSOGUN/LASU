import type { Metadata } from "next";
import { FindCare } from "@/features/care/FindCare";

export const metadata: Metadata = {
  title: "Find care · HealthAccess",
  description:
    "Search the public HealthAccess directory by service and area. No account is needed, and a recommendation does not book a visit.",
};

export default function FindCarePage() {
  return <FindCare />;
}
