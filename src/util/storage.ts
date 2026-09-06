// Browser storage may be disabled in embedded/private contexts. Preferences
// and scores still work for the current session when persistence is unavailable.
const session = new Map<string, string>();

export function readSaved(key: string): string | null {
  if (session.has(key)) return session.get(key)!;
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeSaved(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    session.delete(key);
  } catch { session.set(key, value); }
}
