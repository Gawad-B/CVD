import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import featureImportance from "./featureImportance.json";
import { LandingPage } from "./LandingPage";

function renderLanding() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        ),
        children: [
          { path: "/", element: <LandingPage /> },
          { path: "/login", element: <div>login page</div> },
        ],
      },
    ],
    { initialEntries: ["/"] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

function mockFetch(response: () => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async () => response()) as unknown as typeof fetch;
}

afterEach(() => localStorage.clear());

describe("LandingPage", () => {
  it("Try a demo creates an account and navigates to /login with credentials", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ username: "demo-abc123", password: "p4ssw0rd-p4ssw0", expiresAt: "2026-10-19T00:00:00Z" }))
    );
    const router = renderLanding();
    await userEvent.click(screen.getAllByRole("button", { name: /try a demo/i })[0]);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.state).toEqual({
      username: "demo-abc123",
      password: "p4ssw0rd-p4ssw0",
      fromDemo: true,
      expiresAt: "2026-10-19T00:00:00Z",
    });
  });

  it("disables the buttons while the demo is being created", async () => {
    let release: (r: Response) => void = () => {};
    mockFetch(() => new Promise<Response>((resolve) => (release = resolve)));
    renderLanding();
    await userEvent.click(screen.getAllByRole("button", { name: /try a demo/i })[0]);
    const busy = await screen.findAllByRole("button", { name: /creating your demo/i });
    busy.forEach((button) => expect(button).toBeDisabled());
    release(new Response(JSON.stringify({ username: "u", password: "p", expiresAt: "" })));
  });

  it("shows the server message in a dialog on 429 and lets the visitor go back", async () => {
    mockFetch(() => new Response(JSON.stringify({ detail: "Too many demos from your network today." }), { status: 429 }));
    renderLanding();
    await userEvent.click(screen.getAllByRole("button", { name: /start a screening|try a demo/i })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Too many demos from your network today.");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows Open app instead of Try a demo for signed-in users", () => {
    localStorage.setItem("cardio_token", "t");
    localStorage.setItem("cardio_user", JSON.stringify({ userId: 1, username: "dr", role: "doctor" }));
    renderLanding();
    expect(screen.getAllByRole("link", { name: /open app/i })[0]).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: /try a demo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("offers a Log in link to signed-out visitors", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("never presents the ML score as a 10-year risk", () => {
    renderLanding();
    expect(screen.queryAllByText(/10-year/i).every((node) => /PREVENT/.test(node.textContent ?? ""))).toBe(true);
    expect(screen.getByText(/evaluated on 1,066 held-out patients/i)).toBeInTheDocument();
  });

  it("renders the real feature importance bars from the generated JSON", () => {
    renderLanding();
    expect(featureImportance.length).toBe(5);
    for (const item of featureImportance) {
      expect(screen.getByLabelText(`${item.label}: ${item.value}% of the strongest input`)).toBeInTheDocument();
    }
    expect(screen.getByText("Relative weight of each input in the NHANES model")).toBeInTheDocument();
  });
});
