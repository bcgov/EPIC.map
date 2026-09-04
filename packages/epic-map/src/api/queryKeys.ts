/**
 * The widget runs its own QueryClient inside the host's, so its cache is separate.
 * Keys are prefixed anyway: it keeps devtools readable when both caches are open,
 * and it means a future decision to share the host's client cannot collide.
 */
export const QUERY_KEY_PREFIX = "epic-map";

type QueryKeyPart = string | number | boolean | null | undefined;

/** Build a namespaced query key. Every key in this package must come from here. */
export const epicMapQueryKey = (
  ...parts: QueryKeyPart[]
): readonly QueryKeyPart[] => [QUERY_KEY_PREFIX, ...parts];
