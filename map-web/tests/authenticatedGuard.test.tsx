// @vitest-environment jsdom
//
// A silent token renewal holds react-oidc-context's `isLoading` true, and a
// guard that read it unmounted the whole application mid-session (MAP-87).

import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Mount count, not presence: a rebuilt subtree looks identical otherwise.
const mounted = { count: 0 };

function StubOutlet() {
  useEffect(() => {
    mounted.count += 1;
  }, []);

  return <div data-testid="application" />;
}

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Outlet: StubOutlet,
}));

const session = {
  isAuthenticated: true,
  isLoading: false,
  signinRedirect: vi.fn(),
  signoutRedirect: vi.fn(),
  user: { profile: { preferred_username: "tester" } },
};

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ ...session }),
}));

const currentUser: {
  isLoading: boolean;
  isAccessDenied: boolean;
  user: { permissions: string[] } | null;
} = {
  isLoading: false,
  isAccessDenied: false,
  user: { permissions: [] },
};

vi.mock("@/hooks/useAuthorization", () => ({
  useCurrentUser: () => ({ ...currentUser }),
}));

const { Authenticated } = await import("@/routes/_authenticated");

describe("the authenticated layout", () => {
  beforeEach(() => {
    mounted.count = 0;
    Object.assign(session, {
      isAuthenticated: true,
      isLoading: false,
      user: { profile: { preferred_username: "tester" } },
    });
    Object.assign(currentUser, {
      isLoading: false,
      isAccessDenied: false,
      user: { permissions: [] },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the application once there is a session and a current user", () => {
    render(<Authenticated />);

    expect(screen.getByTestId("application")).toBeTruthy();
    expect(mounted.count).toBe(1);
  });

  it("keeps the application mounted through a silent token renewal", () => {
    const { rerender } = render(<Authenticated />);
    expect(mounted.count).toBe(1);

    // What a renewal looks like from here: signed in, `isLoading` true.
    session.isLoading = true;
    rerender(<Authenticated />);

    expect(screen.getByTestId("application")).toBeTruthy();
    expect(mounted.count).toBe(1);

    session.isLoading = false;
    rerender(<Authenticated />);

    expect(mounted.count).toBe(1);
  });

  it("keeps the application mounted while the current user is refetched", () => {
    const { rerender } = render(<Authenticated />);

    currentUser.isLoading = true;
    rerender(<Authenticated />);

    expect(screen.getByTestId("application")).toBeTruthy();
    expect(mounted.count).toBe(1);
  });

  it("does not redirect to sign in during a renewal", () => {
    render(<Authenticated />);

    session.isLoading = true;
    render(<Authenticated />);

    expect(session.signinRedirect).not.toHaveBeenCalled();
  });

  it("shows the sign-in spinner while a stored session is being restored", () => {
    session.isAuthenticated = false;
    session.isLoading = true;

    render(<Authenticated />);

    expect(screen.getByText("Signing in")).toBeTruthy();
    expect(screen.queryByTestId("application")).toBeNull();
    expect(mounted.count).toBe(0);
  });

  it("waits for the first current user before rendering the application", () => {
    currentUser.user = null;

    render(<Authenticated />);

    expect(screen.queryByTestId("application")).toBeNull();
    expect(mounted.count).toBe(0);
  });

  it("reports an IDIR user the API will not admit", () => {
    currentUser.isAccessDenied = true;

    render(<Authenticated />);

    expect(screen.queryByTestId("application")).toBeNull();
  });
});
