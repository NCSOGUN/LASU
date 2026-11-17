import type { Metadata } from "next";
import { AssistantThread } from "@/features/assistant/AssistantThread";

export const metadata: Metadata = { title: "Conversation · HealthAccess" };
// The shell reads usePathname, so this owner-only route cannot prerender a static shell.
export const instant = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssistantThread id={id} />;
}
