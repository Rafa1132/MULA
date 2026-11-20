"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/common/components";
import { projectPath } from "@/common/services/project";
import type { Project } from "../services/projects";

type Props = {
  project: Project;
  busy: boolean;
  onRename: (project: Project, name: string) => Promise<string>;
};

/** One project: its name (the link to open it), rename for owners, and the GitHub placeholder. */
export default function ProjectCard({ project, busy, onRename }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name ?? "");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  // Set when a rename closes, so focus goes back to Rename once it is shown and enabled again.
  const returnFocus = useRef(false);
  const titleId = `project-${project.id}-title`;

  useEffect(() => {
    if (renaming) input.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (renaming || busy || !returnFocus.current) return;
    returnFocus.current = false;
    renameButton.current?.focus();
  }, [renaming, busy]);

  function close() {
    setRenaming(false);
    setError("");
    setName(project.name ?? "");
    // Back to where the rename started, so keyboard users keep their place.
    returnFocus.current = true;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = await onRename(project, name);
    if (problem) {
      setError(problem);
      return;
    }
    setRenaming(false);
    setError("");
    returnFocus.current = true;
  }

  return <li className="project-card" aria-labelledby={titleId}>
    <span className="project-card-icon" aria-hidden="true"><Icon name="folder" /></span>
    {!renaming && <h3 id={titleId}><a href={projectPath(project.id)}>{project.display_name}</a></h3>}
    {renaming && <form className="project-rename" onSubmit={submit}>
      <label htmlFor={`project-${project.id}-name`}>Project name</label>
      <input id={`project-${project.id}-name`} ref={input} value={name} maxLength={80} onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
        aria-describedby={`project-${project.id}-name-hint`} disabled={busy} />
      <small id={`project-${project.id}-name-hint`}>Leave it empty to show “Untitled project”.</small>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="project-card-actions">
        <button type="submit" className="account-submit" disabled={busy}>Save</button>
        <button type="button" className="account-toggle" onClick={close} disabled={busy}>Cancel</button>
      </div>
    </form>}
    {!renaming && project.description && <p className="project-card-description">{project.description}</p>}
    <p className="project-card-meta">Created {new Date(project.created_at).toLocaleDateString()}{project.role === "member" && " · Shared with you"}</p>
    {!renaming && <div className="project-card-actions">
      <a className="account-submit project-open" href={projectPath(project.id)} aria-label={`Open ${project.display_name}`}>Open</a>
      {project.role === "owner" && <button ref={renameButton} type="button" className="account-toggle" onClick={() => setRenaming(true)} disabled={busy}
        aria-label={`Rename ${project.display_name}`}>Rename</button>}
      {/* Placeholder only: connecting a GitHub repository per project is not built yet. */}
      <button type="button" className="coming-soon" aria-disabled="true" aria-label={`Connect GitHub to ${project.display_name}: coming soon`}>
        GitHub <span className="coming-soon-badge">Coming soon</span>
      </button>
    </div>}
  </li>;
}
