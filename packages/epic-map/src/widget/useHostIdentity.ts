import { useQuery } from "@tanstack/react-query";
import { epicMapQueryKey } from "@/api/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";
import type { HostIdentity } from "@/widget/identity";

/**
 * Who the host has signed in, as read from its access token.
 *
 * Goes through the widget's QueryClient so a remount does not ask the host for a
 * token again, and so several components can show identity without each one
 * triggering its own `getAccessToken`.
 *
 * A failure resolves to `null` rather than being reported through `onError`: not
 * being able to name the user is a display gap, not a failure of the widget, and
 * an API call will surface a genuinely broken session soon enough.
 */
export const useHostIdentity = (): HostIdentity | null => {
  const { readHostIdentity } = useMapWidget();

  const { data } = useQuery({
    queryKey: epicMapQueryKey("host-identity"),
    queryFn: readHostIdentity,
    staleTime: Infinity,
    retry: false,
  });

  return data ?? null;
};
