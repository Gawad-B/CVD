import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "./routes";

const expired = { detail: { code: "demo_expired", message: "Your demo has ended.", contactEmail: "a@b.co" } };

afterEach(() => localStorage.clear());

describe("router: expired demo mid-session", () => {
  it("ends on /login showing the expired message and mailto contact", async () => {
    localStorage.setItem("cardio_token", "t");
    localStorage.setItem(
      "cardio_user",
      JSON.stringify({ userId: 1, username: "demo-x", role: "doctor", isDemo: true })
    );
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(expired), { status: 403 })) as unknown as typeof fetch;
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/dashboard"] });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Your demo has ended.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "a@b.co" });
    expect(link.getAttribute("href")).toMatch(/^mailto:a@b\.co/);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(localStorage.getItem("cardio_token")).toBeNull();
  });

  it("redirects unauthenticated visitors of an app route to /login", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/patients"] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
