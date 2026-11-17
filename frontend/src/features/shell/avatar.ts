/** Render initials into a data URI so the user-menu trigger exposes text, not a second visible label. */
export function initialsAvatar(name: string): string {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "H";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" role="presentation"><rect width="40" height="40" rx="20" fill="#152224"/><text x="20" y="26" text-anchor="middle" font-family="Inter, sans-serif" font-size="15" font-weight="500" fill="#a8e4c9">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
