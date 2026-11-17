import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "@/features/auth/LoginForm";

// Auth pages read the redirect target at request time; they are not part of the static shell.
export const instant = false;


export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : "/app";
  return <LoginForm nextPath={next} />;
}
