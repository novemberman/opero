"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceShell } from "../../../components/workspace/workspace-shell";

export default function OrganizationWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  if (!orgId) return children;
  return <WorkspaceShell orgId={orgId}>{children}</WorkspaceShell>;
}
