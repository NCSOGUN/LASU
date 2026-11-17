/**
 * The AI banner belongs to the schedule that was just created. Keeping it in memory avoids putting a
 * flag in the URL or storage, and it clears as soon as the schedule page reads it.
 */
let createdByAi: string | null = null;

export function markAiCreated(id: string) {
  createdByAi = id;
}

export function isAiCreated(id: string) {
  return createdByAi === id;
}

export function clearAiCreated(id: string) {
  if (createdByAi === id) createdByAi = null;
}
