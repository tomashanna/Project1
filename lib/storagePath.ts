/**
 * Builds a collision-resistant object name for Supabase Storage.
 * The original file name is reduced to a safe charset so it can never add
 * path segments ("/", "..") or characters Storage rejects.
 */
export function storageObjectName(fileName: string, now: number = Date.now()): string {
  const safe =
    fileName
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "_")
      .slice(-120) || "archivo";
  return `${now}_${safe}`;
}
