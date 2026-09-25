/**
 * An id for one mounted widget, so map-api can tell one map's clicks from
 * another's.
 *
 * Deliberately not stable across mounts and not stored anywhere: it is not a
 * session, a user or a device, and nothing is ever looked up by it. All it has
 * to do is be different from every other map's for as long as this one lives.
 */
export const newClientId = (): string => {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random.replace(/-/g, "");

  // Older Safari and any non-secure context, where randomUUID is missing. A
  // collision here would only cost a click, so this does not need to be strong.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};
