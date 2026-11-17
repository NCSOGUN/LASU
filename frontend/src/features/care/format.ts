const distanceFormatter = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

const verifiedFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDistanceKm(value: number): string {
  return distanceFormatter.format(value);
}

/** The exact distance label scope §7.8 asks for: a straight-line distance from the area centre. */
export function distanceFromCentre(value: number): string {
  return `≈ ${formatDistanceKm(value)} km from the area centre (straight line)`;
}

export function lastVerifiedLabel(value: string | null | undefined): string {
  if (!value) return "Directory details have not been verified.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Directory details have not been verified.";
  return `Directory details last verified ${verifiedFormatter.format(date)}`;
}

export function sourceTrustLabel(value: string): string {
  const cleaned = value.trim().replaceAll("_", " ").toLocaleLowerCase();
  return `Source trust: ${cleaned || "unknown"}`;
}

export function sourceTrustTone(value: string): "neutral" | "success" | "warning" {
  const normalized = value.trim().toLocaleLowerCase();
  if (["verified", "trusted", "high"].includes(normalized)) return "success";
  if (["partial", "medium", "review", "pending"].includes(normalized)) return "warning";
  return "neutral";
}

export function areaLabel(area: { name: string; region?: string | null }): string {
  const region = area.region?.trim();
  return region && region !== area.name ? `${area.name}, ${region}` : area.name;
}
