import { LinkProps } from "@tanstack/react-router";

export type NavItem = {
  name: string;
  path: LinkProps["to"];
};

/** Left navigation entries, in display order. */
export const NAV_ITEMS: Array<NavItem> = [
  { name: "Launchpad", path: "/" },
  { name: "Request Access", path: "/request-access" },
  { name: "Application URLs", path: "/application-urls" },
  { name: "Map", path: "/map" },
];
