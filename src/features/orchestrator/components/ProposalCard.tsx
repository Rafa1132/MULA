"use client";
import { useEffect, useRef, useState } from "react";
import { projectPath } from "@/common/services/project";
import { confirmProposal, declineProposal } from "../services/orchestrator";
import type { CreatedProject, ProjectProposal } from "../services/orchestrator";

type Props = {
  proposal: ProjectProposal;
  onChange: (proposal: ProjectProposal) => void;
  // Called once the project exists, so the workspace can show its card straight away.
  onCreated: (project: CreatedProject) => void;
};

/**
 * A project the assistant proposed, under the reply that proposed it. Nothing is created until
 * the owner presses "Create project"; the server checks the proposal belongs to the signed-in
 * account and that the workspace has room.
 */
export default function ProposalCard({ proposal, onChange, onCreated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedProject | null>(null);
  const result = useRef<HTMLAnchorElement & HTMLParagraphElement>(null);
  const answeredHere = useRef(false);

  // After answering, focus moves to the outcome (the link to the new project), not back to the top.
  useEffect(() => {
    if (answeredHere.current && proposal.status !== "pending") result.current?.focus();
  }, [proposal.status]);

  async function answer(confirm: boolean) {
    setBusy(true);
    setError("");
    try {
      answeredHere.current = true;
      if (confirm) {
        const outcome = await confirmProposal(proposal.id);
        setCreated(outcome.project);
        onCreated(outcome.project);
        onChange(outcome.proposal);
      } else {
        onChange((await declineProposal(proposal.id)).proposal);
      }
    } catch (failure) {
      answeredHere.current = false;
      if (failure instanceof Error) setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const titleId = `proposal-${proposal.id}`;
  return <div className="proposal-card" role="group" aria-labelledby={titleId} data-status={proposal.status}>
    <p className="proposal-eyebrow">New project</p>
    <p className="proposal-name" id={titleId}>{proposal.name}</p>
    {proposal.description && <p className="proposal-description">{proposal.description}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {proposal.status === "pending" && <div className="assistant-actions">
      <button type="button" className="account-submit" disabled={busy} onClick={() => answer(true)}>Create project</button>
      <button type="button" className="account-toggle" disabled={busy} onClick={() => answer(false)}>Not now</button>
    </div>}
    {proposal.status === "created" && proposal.project_id && <p className="proposal-outcome">
      Created {created?.display_name ?? proposal.name}.{" "}
      <a ref={result} href={projectPath(proposal.project_id)}>Open {created?.display_name ?? proposal.name}</a>
    </p>}
    {proposal.status === "declined" && <p ref={result} tabIndex={-1} className="proposal-outcome">Not created.</p>}
  </div>;
}
