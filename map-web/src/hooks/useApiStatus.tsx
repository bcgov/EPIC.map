import { useQuery } from "@tanstack/react-query";
import { requestOps } from "@/utils/axiosUtils";

export type ApiStatus = {
  message: string;
};

const fetchReadiness = (): Promise<ApiStatus> => {
  return requestOps({ url: "/readyz" });
};

/** Calls the API's readiness probe so the UI can confirm it is wired up. */
export const useApiReadiness = () => {
  return useQuery({
    queryKey: ["ops", "readyz"],
    queryFn: fetchReadiness,
    retry: 1,
  });
};
