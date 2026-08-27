import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/Shared/ComingSoon";

export const Route = createFileRoute("/_authenticated/application-urls")({
  component: ApplicationUrls,
});

function ApplicationUrls() {
  return <ComingSoon />;
}
