"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "../../../../components/site-header";
import { apiFetch } from "../../../../lib/api";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; name: string };
};

export default function OrganizationMembersPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ANALYST");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadMembers() {
    const { status, body } = await apiFetch<{ members?: Member[]; message?: string }>(
      `/organizations/${orgId}/members`,
    );
    if (status >= 400) {
      setError(body.message ?? "Unable to load members");
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
    const { status, body } = await apiFetch<{ message?: string }>(
      `/organizations/${orgId}/invitations`,
      {
        method: "POST",
        json: { email, role },
      },
    );
    if (status >= 400) {
      setError(typeof body.message === "string" ? body.message : "Invite failed");
      return;
    }
    setMessage("Invitation queued to development mail");
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
    <>
      <SiteHeader mark="Members" />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <h1 className="text-3xl text-ink">Members</h1>
        {error ? <p className="mt-4 text-copper">{error}</p> : null}
        {message ? <p className="mt-4 text-pine">{message}</p> : null}
        <ul className="mt-8 space-y-3">
          {members.map((member) => (
            <li key={member.id} className="rounded-2xl border border-line bg-white/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-ink">{member.user.name}</p>
                  <p className="text-sm text-muted">{member.user.email}</p>
                </div>
                <select
                  className="min-h-11 rounded-xl border border-line bg-white px-3"
                  value={member.role}
                  onChange={(e) => void changeRole(member.user.id, e.target.value)}
                >
                  {["OWNER", "ADMIN", "ANALYST", "VIEWER"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
        <form className="mt-10 max-w-md space-y-3" onSubmit={invite}>
          <h2 className="text-2xl text-ink">Invite member</h2>
          <input
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {["ADMIN", "ANALYST", "VIEWER"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper" type="submit">
            Send invitation
          </button>
        </form>
      </main>
    </>
  );
}
