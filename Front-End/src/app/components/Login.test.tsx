import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  clearSessionEnded: vi.fn(),
  sessionEnded: null as null | { code?: string; message: string; contactEmail?: string },
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login: auth.login, sessionEnded: auth.sessionEnded, clearSessionEnded: auth.clearSessionEnded }),
}));

import { Login } from "./Login";

function renderLogin(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
      <Login />
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.login.mockReset();
  auth.clearSessionEnded.mockReset();
  auth.sessionEnded = null;
});

describe("Login", () => {
  it("prefills demo credentials and shows the save notice with copy buttons", () => {
    renderLogin({ username: "demo-ab12cd", password: "s3cret-pass-1234", fromDemo: true, expiresAt: "2026-10-19T00:00:00Z" });
    expect(screen.getByLabelText("Username")).toHaveValue("demo-ab12cd");
    expect(screen.getByLabelText("Password")).toHaveValue("s3cret-pass-1234");
    expect(screen.getByRole("status")).toHaveTextContent("save these credentials to come back (valid until 19 Oct 2026)");
    expect(screen.getByRole("button", { name: "Copy username" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy password" })).toBeInTheDocument();
  });

  it("shows no notice for a normal visit", () => {
    renderLogin();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the expired panel with a mailto contact when login returns demo_expired", async () => {
    auth.login.mockImplementationOnce(() =>
      Promise.reject(
        new ApiError({ status: 403, code: "demo_expired", message: "Your 15-day demo has ended.", contactEmail: "me@example.com" })
      )
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("Username"), "demo-old");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const link = await screen.findByRole("link", { name: "me@example.com" });
    expect(link.getAttribute("href")).toMatch(/^mailto:me@example\.com/);
    expect(screen.getByText("Your 15-day demo has ended.")).toBeInTheDocument();
    expect(auth.login).toHaveBeenCalledTimes(1);
  });

  it("shows the expired panel from the ended session and clears it after display", () => {
    auth.sessionEnded = { code: "demo_expired", message: "Your 15-day demo has ended.", contactEmail: "me@example.com" };
    renderLogin();
    expect(screen.getByRole("link", { name: "me@example.com" })).toBeInTheDocument();
    expect(auth.clearSessionEnded).toHaveBeenCalledTimes(1);
  });

  it("shows a copy failure message when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    renderLogin({ username: "demo-ab12cd", password: "s3cret-pass-1234", fromDemo: true });
    await userEvent.click(screen.getByRole("button", { name: "Copy password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed — select and copy manually");
  });

  it("shows lockout and generic errors", async () => {
    auth.login.mockImplementationOnce(() =>
      Promise.reject(new ApiError({ status: 429, message: "Too many failed login attempts. Try again later." }))
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("Username"), "u");
    await userEvent.type(screen.getByLabelText("Password"), "p");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many failed login attempts");

    auth.login.mockImplementationOnce(() => Promise.reject(new ApiError({ status: 401, message: "Invalid credentials" })));
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Incorrect username or password."));
  });
});
