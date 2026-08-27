import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/Shared/ComingSoon";

export const Route = createFileRoute("/request-access")({
  component: RequestAccess,
});

function RequestAccess() {
  return <ComingSoon />;
}
