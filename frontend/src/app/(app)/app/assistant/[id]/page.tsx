import type { Metadata } from "next";
import { AssistantThread } from "@/features/assistant/AssistantThread";

export const metadata: Metadata = { title: "Conversation · HealthAccess" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssistantThread id={id} />;
}
