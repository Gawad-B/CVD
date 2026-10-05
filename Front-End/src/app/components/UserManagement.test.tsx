import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/types";

const api = vi.hoisted(() => ({ getUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn() }));
vi.mock("../api/client", () => api);
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { userId: 1, role: "admin" } }) }));

import { UserManagement } from "./UserManagement";

const user = (over: Partial<User>): User => ({
  userId: 2,
  username: "dr.lee",
  email: "lee@clinic.test",
  fullName: "Dr Lee",
  role: "doctor",
  isActive: true,
  lastLoginAt: "2026-10-01T09:30:00Z",
  createdAt: "2026-01-01T00:00:00Z",
  isDemo: false,
  demoExpiresAt: null,
  ...over,
});

const admin = user({ userId: 1, username: "root", fullName: "Root Admin", email: "root@clinic.test", role: "admin" });
const doctor = user({});
const demo = user({ userId: 3, username: "demo-x", fullName: "Demo X", email: "demo@x.test", role: "clinician", isDemo: true, demoExpiresAt: "2026-10-12T00:00:00Z", lastLoginAt: undefined });

describe("UserManagement", () => {
  beforeEach(() => {
    api.getUsers.mockReset().mockResolvedValue([admin, doctor, demo]);
    api.updateUser.mockReset();
    api.createUser.mockReset();
  });

  it("disables the access switch for your own row and tags demo users", async () => {
    render(<UserManagement />);
    const own = await screen.findByRole("switch", { name: "Access for Root Admin" });
    expect(own).toBeDisabled();
    expect(own.parentElement).toHaveAttribute("title", "You can't deactivate your own account");
    expect(screen.getByRole("switch", { name: "Access for Dr Lee" })).toBeEnabled();
    expect(screen.getByText("Demo · expires 12 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("tags an expired demo user as expired", async () => {
    api.getUsers.mockResolvedValue([admin, { ...demo, demoExpiresAt: "2020-01-02T00:00:00Z" }]);
    render(<UserManagement />);
    expect(await screen.findByText("Demo · expired 2 Jan 2020")).toBeInTheDocument();
  });

  it("toggles access with an isActive PATCH", async () => {
    api.updateUser.mockResolvedValue({ ...doctor, isActive: false });
    const u = userEvent.setup();
    render(<UserManagement />);
    const sw = await screen.findByRole("switch", { name: "Access for Dr Lee" });
    await u.click(sw);
    const dialog = screen.getByRole("dialog", { name: "Deactivate user?" });
    expect(dialog).toHaveTextContent("Deactivate Dr Lee? They will be signed out immediately.");
    expect(api.updateUser).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(2, { isActive: false }));
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "false"));
  });

  it("activating needs no confirmation", async () => {
    api.getUsers.mockResolvedValue([admin, { ...doctor, isActive: false }]);
    api.updateUser.mockResolvedValue(doctor);
    const u = userEvent.setup();
    render(<UserManagement />);
    await u.click(await screen.findByRole("switch", { name: "Access for Dr Lee" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.updateUser).toHaveBeenCalledWith(2, { isActive: true });
  });

  it("edit sends only the changed fields; password is optional", async () => {
    api.updateUser.mockResolvedValue({ ...doctor, email: "new@clinic.test" });
    const u = userEvent.setup();
    render(<UserManagement />);
    await u.click(await screen.findByRole("button", { name: "Edit Dr Lee" }));
    const dialog = screen.getByRole("dialog", { name: "Edit user" });
    const email = within(dialog).getByLabelText("Email");
    await u.clear(email);
    await u.type(email, "new@clinic.test");
    await u.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(api.updateUser).toHaveBeenCalledTimes(1);
    expect(api.updateUser).toHaveBeenCalledWith(2, { email: "new@clinic.test" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends role only when changed and rejects a short new password", async () => {
    api.updateUser.mockResolvedValue({ ...doctor, role: "auditor" });
    const u = userEvent.setup();
    render(<UserManagement />);
    await u.click(await screen.findByRole("button", { name: "Edit Dr Lee" }));
    const dialog = screen.getByRole("dialog", { name: "Edit user" });
    await u.type(within(dialog).getByLabelText("New password (optional)"), "short");
    await u.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(api.updateUser).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("at least 12");
    await u.clear(within(dialog).getByLabelText("New password (optional)"));
    await u.selectOptions(within(dialog).getByLabelText("Role"), "auditor");
    await u.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(api.updateUser).toHaveBeenCalledWith(2, { role: "auditor" });
  });

  it("locks the role for demo accounts and warns when editing yourself", async () => {
    const u = userEvent.setup();
    render(<UserManagement />);
    await u.click(await screen.findByRole("button", { name: "Edit Demo X" }));
    let dialog = screen.getByRole("dialog", { name: "Edit user" });
    expect(within(dialog).getByLabelText("Role")).toBeDisabled();
    expect(within(dialog).getByText("Demo accounts cannot change role")).toBeInTheDocument();
    expect(within(dialog).queryByRole("note")).not.toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await u.click(screen.getByRole("button", { name: "Edit Root Admin" }));
    dialog = screen.getByRole("dialog", { name: "Edit user" });
    expect(within(dialog).getByRole("note")).toHaveTextContent("signs you out");
    expect(within(dialog).getByLabelText("Role")).toBeDisabled();
    expect(within(dialog).getByText("You can't change your own role")).toBeInTheDocument();
  });

  it("creates a user", async () => {
    api.createUser.mockResolvedValue(user({ userId: 9, username: "new.user", fullName: "New User", email: "n@x.test", role: "clinician" }));
    const u = userEvent.setup();
    render(<UserManagement />);
    await u.click(await screen.findByRole("button", { name: "Create user" }));
    const dialog = screen.getByRole("dialog", { name: "Create user" });
    await u.type(within(dialog).getByLabelText("Username"), "new.user");
    await u.type(within(dialog).getByLabelText("Email"), "n@x.test");
    await u.type(within(dialog).getByLabelText("Password"), "a-long-enough-pass");
    await u.click(within(dialog).getByRole("button", { name: "Create user" }));
    expect(api.createUser).toHaveBeenCalledWith({ username: "new.user", email: "n@x.test", role: "clinician", password: "a-long-enough-pass" });
    expect(await screen.findByRole("switch", { name: "Access for New User" })).toBeInTheDocument();
  });
});
