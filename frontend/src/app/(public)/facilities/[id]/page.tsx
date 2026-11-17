import { Suspense } from "react";
import type { Metadata } from "next";
import { FacilityDetailSkeleton, FacilityDetailView } from "@/features/care/FacilityDetail";

export const metadata: Metadata = {
  title: "Facility details · HealthAccess",
  description: "Public directory details for a listed HealthAccess facility.",
};

async function FacilityRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FacilityDetailView id={id} />;
}

export default function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<FacilityDetailSkeleton />}>
      <FacilityRoute params={params} />
    </Suspense>
  );
}
