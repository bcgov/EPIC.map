import { useQuery } from "@tanstack/react-query";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";
import type { HostIdentity } from "@/utils/identity";

/**
 * Who the host has signed in, as read from its access token.
 *
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
