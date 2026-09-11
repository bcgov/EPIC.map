import { useEffect, useState } from "react";

const read = (key: string, fallback: boolean): boolean => {
  try {
    // eslint-disable-next-line no-restricted-syntax -- UI flag, not a credential; see above
    const stored = window.sessionStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
};

const write = (key: string, value: boolean): void => {
  try {
    // eslint-disable-next-line no-restricted-syntax -- UI flag, not a credential; see above
    window.sessionStorage.setItem(key, String(value));
  } catch {
    // Storage is unavailable; the value simply does not outlive the mount.
  }
};

export const useSessionFlag = (key: string, fallback: boolean) => {
  const [value, setValue] = useState(() => read(key, fallback));

  useEffect(() => write(key, value), [key, value]);

  return [value, setValue] as const;
};
