import { createFileRoute } from "@tanstack/react-router";
import MapContainer from "@/components/Map/MapContainer";
import MapSearchBar from "@/components/Map/MapSearchBar";

export const Route = createFileRoute("/map")({
  component: MapPage,
});

function MapPage() {
  return (
    <>
      <MapSearchBar />
      <MapContainer />
    </>
  );
}
