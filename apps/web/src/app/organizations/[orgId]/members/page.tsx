"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ChangeEvent } from "react";
import { Alert, Badge, Button, EmptyState, Input, Select, Skeleton } from "../../../../components/ui";
import { apiFetch } from "../../../../lib/api";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; name: string };
};

export default function OrganizationMembersPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ANALYST");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  async function loadMembers() {
    const { status, body } = await apiFetch<{ members?: Member[]; message?: string }>(
      `/organizations/${orgId}/members`,
    );
    if (status >= 400) {
      setError(body.message ?? "Unable to load members");
      setMembers([]);
      return;
    }
    setError(null);
    setMembers(body.members ?? []);
  }

  useEffect(() => {
    // Client fetch against the Nest API (cookie session on API origin).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when org changes
  }, [orgId]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setInviting(true);
    const { status, body } = await apiFetch<{ message?: string }>(
      `/organizations/${orgId}/invitations`,
      {
        method: "POST",
        json: { email, role },
      },
    );
    setInviting(false);
    if (status >= 400) {
      setError(typeof body.message === "string" ? body.message : "Invite failed");
      return;
    }
    setMessage("Invitation queued. The recipient must accept before joining this organization.");
    setEmail("");
  }

  async function changeRole(userId: string, nextRole: string) {
    setError(null);
    const { status, body } = await apiFetch<{ message?: string }>(
      `/organizations/${orgId}/members/${userId}`,
      {
        method: "PATCH",
        json: { role: nextRole },
      },
    );
    if (status >= 400) {
      setError(typeof body.message === "string" ? body.message : "Role change failed");
      return;
    }
    await loadMembers();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="text-3xl text-ink">Members</h1>
      <p className="mt-2 text-sm text-muted">
        Organization roles control who can review statements, approve reports, and manage billing.
      </p>

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title="Members action failed">
            {error}
          </Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mt-4">
          <Alert tone="success" title="Invitation sent">
            {message}
          </Alert>
        </div>
      ) : null}

      {members === null ? (
        <div className="mt-8 space-y-3" data-testid="members-loading">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {members && members.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No members loaded"
            description="Retry or confirm you still have access to this organization."
          />
        </div>
      ) : null}

      {members && members.length > 0 ? (
        <ul className="mt-8 space-y-3" data-testid="members-list">
          {members.map((member) => (
            <li key={member.id} className="rounded-2xl border border-line bg-white/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-ink">{member.user.name}</p>
                  <p className="text-sm text-muted">{member.user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{member.role}</Badge>
                  <Select
                    aria-label={`Role for ${member.user.name}`}
                    value={member.role}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      void changeRole(member.user.id, e.target.value)
                    }
                  >
                    {["OWNER", "ADMIN", "ANALYST", "VIEWER"].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="mt-10 max-w-md space-y-3" onSubmit={invite} data-testid="members-invite">
        <h2 className="text-2xl text-ink">Invite member</h2>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          required
        />
        <Select
          value={role}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)}
          aria-label="Invite role"
        >
          {["ADMIN", "ANALYST", "VIEWER"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Button type="submit" loading={inviting} disabled={inviting}>
          {inviting ? "Sending…" : "Send invitation"}
        </Button>
      </form>
    </div>
  );
}
