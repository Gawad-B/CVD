import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { createUser, getUsers, updateUser } from "../api/client";
import type { UpdateUserInput, User } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Avatar, Badge, Button, Card, ConfirmModal, Field, Input, Modal, PasswordInput, Select, Switch } from "../ui";
import { ErrorCard, Skeleton } from "./dashboard/Panels";
import { formatDate } from "./dashboard/logic";
import { PageHeader } from "./PageHeader";

const ROLES: User["role"][] = ["admin", "doctor", "clinician", "auditor"];
const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
const MIN_PASSWORD = 12;

const TH = "px-4 py-3 text-left text-[12px] font-semibold text-[#5b6b85]";
const TD = "px-4 py-3 align-middle";

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function lastSignIn(iso: string | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function RoleSelect({ value, onChange, disabled, hint }: { value: User["role"]; onChange: (r: User["role"]) => void; disabled?: boolean; hint?: string }) {
  return (
    <Field label="Role" hint={hint}>
      {(c) => (
        <Select {...c} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as User["role"])}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<User["role"]>("clinician");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !email.trim()) {
      setError("Username and email are required.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setPasswordError(undefined);
    setSaving(true);
    try {
      onCreated(await createUser({ username: username.trim(), email: email.trim(), role, password }));
    } catch (e) {
      setError(errorText(e, "Could not create the user."));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Create user" className="max-w-[460px]">
      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
        <Field label="Username">{(c) => <Input {...c} value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />}</Field>
        <Field label="Email">{(c) => <Input {...c} type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />}</Field>
        <RoleSelect value={role} onChange={setRole} />
        <Field label="Password" error={passwordError} hint={`At least ${MIN_PASSWORD} characters.`}>
          {(c) => <PasswordInput {...c} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[#b91c1c]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create user"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, isSelf, onClose, onSaved }: { user: User; isSelf: boolean; onClose: () => void; onSaved: (user: User) => void }) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<User["role"]>(user.role);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isDemo = Boolean(user.isDemo);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password && password.length < MIN_PASSWORD) {
      setPasswordError(`Use at least ${MIN_PASSWORD} characters, or leave it blank.`);
      return;
    }
    setPasswordError(undefined);
    // Role and password revoke the user's sessions server-side, so send only what changed.
    const changes: UpdateUserInput = {};
    if (username.trim() !== user.username) changes.username = username.trim();
    if (email.trim() !== user.email) changes.email = email.trim();
    if (role !== user.role) changes.role = role;
    if (password) changes.password = password;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      onSaved(await updateUser(user.userId, changes));
    } catch (e) {
      setError(errorText(e, "Could not save the changes."));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit user" className="max-w-[460px]">
      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
        {isSelf && (
          <p role="note" className="rounded-[12px] bg-[#fef3c7] px-3 py-2 text-[12.5px] font-semibold text-[#b45309]">
            You are editing your own account. Changing your role or password signs you out of all sessions.
          </p>
        )}
        <Field label="Username">{(c) => <Input {...c} value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />}</Field>
        <Field label="Email">{(c) => <Input {...c} type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />}</Field>
        <RoleSelect
          value={role}
          onChange={setRole}
          disabled={isDemo || isSelf}
          hint={isDemo ? "Demo accounts cannot change role" : isSelf ? "You can't change your own role" : undefined}
        />
        <Field
          label="New password (optional)"
          error={passwordError}
          hint={`At least ${MIN_PASSWORD} characters. Leave blank to keep the current password. Changing it signs the user out of all sessions.`}
        >
          {(c) => <PasswordInput {...c} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[#b91c1c]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const alive = useRef(true);

  const load = useCallback(() => {
    setLoadError(false);
    getUsers().then(
      (list) => alive.current && setUsers(list),
      () => alive.current && setLoadError(true)
    );
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const replace = (updated: User) => setUsers((cur) => (cur ?? []).map((u) => (u.userId === updated.userId ? updated : u)));

  async function toggleAccess(target: User, next: boolean) {
    setActionError(null);
    setPending((p) => new Set(p).add(target.userId));
    try {
      replace(await updateUser(target.userId, { isActive: next }));
    } catch (e) {
      setActionError(errorText(e, "Could not change access."));
    } finally {
      setPending((p) => {
        const copy = new Set(p);
        copy.delete(target.userId);
        return copy;
      });
    }
  }

  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      Create user
    </Button>
  );

  let body;
  if (users === null) {
    body = loadError ? <ErrorCard title="Couldn't load users." onRetry={load} /> : <Skeleton className="h-[320px] !rounded-[22px]" />;
  } else {
    body = (
      <Card className="!p-0">
        <div className="relative overflow-x-auto rounded-[22px]" tabIndex={0} role="region" aria-label="Users table">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#e6ebf4]">
                <th scope="col" className={TH}>User</th>
                <th scope="col" className={TH}>Role</th>
                <th scope="col" className={TH}>Last sign-in</th>
                <th scope="col" className={TH}>Access</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const display = u.fullName || u.username;
                const isSelf = me?.userId === u.userId;
                const active = u.isActive !== false;
                return (
                  <tr key={u.userId} className="border-b border-[#e6ebf4] last:border-b-0 hover:bg-[#f6f8fc]">
                    <td className={TD}>
                      <div className="flex items-center gap-3">
                        <Avatar name={display} size={38} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-semibold text-[#0b1530]">{display}</span>
                            {u.isDemo && (
                              <Badge variant="medium">
                                {u.demoExpiresAt ? `Demo · ${new Date(u.demoExpiresAt).getTime() <= Date.now() ? "expired" : "expires"} ${formatDate(u.demoExpiresAt)}` : "Demo"}
                              </Badge>
                            )}
                          </div>
                          <span className="block text-[12px] text-[#5b6b85]">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className={TD}>
                      <Badge variant={u.role} className="capitalize">{u.role}</Badge>
                    </td>
                    <td className={`${TD} tabular-nums text-[#33405a]`}>{lastSignIn(u.lastLoginAt)}</td>
                    <td className={TD}>
                      <span
                        className="inline-flex items-center gap-2.5"
                        title={isSelf ? "You can't deactivate your own account" : undefined}
                      >
                        <Switch
                          checked={active}
                          label={`Access for ${display}`}
                          disabled={isSelf || pending.has(u.userId)}
                          onChange={(next) => (next ? void toggleAccess(u, true) : setDeactivating(u))}
                        />
                        <span className="text-[12.5px] text-[#5b6b85]">{isSelf ? "You" : active ? "Active" : "Inactive"}</span>
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      <Button variant="secondary" size="sm" aria-label={`Edit ${display}`} onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-[#5b6b85]">No users yet.</p>}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Users" subtitle="Who can sign in and what they can see" action={addButton} />
      {actionError && (
        <p role="alert" className="rounded-[12px] bg-[#fee2e2] px-4 py-3 text-[13px] font-semibold text-[#b91c1c]">
          {actionError}
        </p>
      )}
      {body}
      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setUsers((cur) => [created, ...(cur ?? [])]);
            setCreating(false);
          }}
        />
      )}
      <ConfirmModal
        open={deactivating !== null}
        title="Deactivate user?"
        message={`Deactivate ${deactivating ? deactivating.fullName || deactivating.username : ""}? They will be signed out immediately.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={async () => {
          const target = deactivating;
          setDeactivating(null);
          if (target) await toggleAccess(target, false);
        }}
        onClose={() => setDeactivating(null)}
      />
      {editing && (
        <EditUserModal
          user={editing}
          isSelf={me?.userId === editing.userId}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            replace(updated);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
