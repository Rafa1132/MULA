"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon, MulaLogo } from "@/common/components";
import { projectPath } from "@/common/services/project";
import { AccountForm } from "@/features/auth";
import { Project, Workspace, createProject, fetchWorkspace, renameProject } from "../services/projects";
import ProjectCard from "./ProjectCard";
import EntryStage from "./EntryStage";
import type { CreatedProject } from "@/features/orchestrator/services/orchestrator";
import "@/features/orchestrator/orchestrator.css";
import "../workspace.css";

type Account = { id: string; username: string };

/**
 * The page above projects, as one vertical page: first a full-height black screen with the
 * owner's assistant (the orchestrator) as an orb and its chat (EntryStage), then the projects,
 * each a separate business, below. Inviting teammates is a placeholder.
 */
export default function WorkspacePage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");
  const newNameInput = useRef<HTMLInputElement>(null);
  const newProjectButton = useRef<HTMLButtonElement>(null);

  async function load() {
    setLoadError("");
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) {
      setAccount(null);
      return;
    }
    if (!response.ok) throw new Error("Could not load your account.");
    setAccount(await response.json());
    setWorkspace(await fetchWorkspace());
  }

  useEffect(() => {
    load().catch((failure: Error) => setLoadError(failure.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (creating) newNameInput.current?.focus();
  }, [creating]);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }

  function closeCreate() {
    setCreating(false);
    setNewName("");
    setCreateError("");
    requestAnimationFrame(() => newProjectButton.current?.focus());
  }

  async function submitNew(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setCreateError("");
    try {
      const project = await createProject(newName);
      // Straight into the new project: it was made to be used.
      window.location.assign(projectPath(project.id));
    } catch (failure) {
      if (failure instanceof Error) setCreateError(failure.message);
      setBusy(false);
    }
  }

  // A project the assistant proposed and the owner confirmed: its card appears below straight away.
  function addCreated(project: CreatedProject) {
    setWorkspace((current) => {
      if (current === null) return current;
      if (current.projects.some((each) => each.id === project.id)) return current;
      return { ...current, projects: [...current.projects, project] };
    });
    setNotice(`Created “${project.display_name}”. It's in your projects below.`);
  }

  async function rename(project: Project, name: string) {
    setBusy(true);
    try {
      const renamed = await renameProject(project.id, name);
      setWorkspace((current) => {
        if (current === null) return current;
        return { ...current, projects: current.projects.map((each) => { if (each.id === renamed.id) return renamed; return each; }) };
      });
      setNotice(`Renamed to “${renamed.display_name}”.`);
      return "";
    } catch (failure) {
      if (failure instanceof Error) return failure.message;
      return "Could not rename the project.";
    } finally {
      setBusy(false);
    }
  }

  // Black from the first frame, so the orb can rise out of the dark.
  if (loading) return <div className="entry-stage entry-blank"><p role="status" className="sr-only">Opening your workspace…</p></div>;
  if (loadError) return <main className="account-screen"><div><p role="alert">{loadError}</p><button type="button" className="account-toggle" onClick={() => window.location.reload()}>Try again</button></div></main>;
  if (!account || !workspace) return <AccountForm onSignedIn={async () => { setLoading(true); await load().finally(() => setLoading(false)); }} />;

  const full = workspace.projects.length >= workspace.max_projects;
  return <div className="workspace-page">
    <EntryStage onProjectCreated={addCreated}
      brand={<a href="/" className="workspace-brand" aria-label="Mula home"><MulaLogo /></a>}
      account={<div className="workspace-account">
        <span className="avatar" aria-hidden="true">{account.username.slice(0, 1).toUpperCase()}</span>
        <strong>{account.username}</strong>
        <a className="text-button" href="/settings">Settings</a>
        <button className="icon-button" type="button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button>
      </div>} />
    <main className="workspace-main" id="projects">
      <div className="workspace-intro">
        <p className="workspace-eyebrow">Workspace</p>
        <h2 className="workspace-title">Your projects</h2>
        <p>Each project is a separate business, with its own agents, memory and apps.</p>
      </div>
      <p className="sr-only" role="status">{notice}</p>
      <section className="workspace-projects" aria-labelledby="workspace-projects-title">
        <div className="workspace-section-head">
          <h3 id="workspace-projects-title">Projects</h3>
          <div className="workspace-section-actions">
            {/* Placeholder only: inviting teammates to the workspace is not built yet. */}
            <button type="button" className="coming-soon" aria-disabled="true" aria-label="Invite teammates: coming soon">
              Invite teammates <span className="coming-soon-badge">Coming soon</span>
            </button>
            {!creating && <button ref={newProjectButton} type="button" className="account-submit" onClick={() => setCreating(true)} disabled={busy || full}>
              New project
            </button>}
          </div>
        </div>
        {full && <p className="workspace-limit">You have {workspace.max_projects} projects, the most a workspace can hold for now.</p>}
        {creating && <form className="project-new" onSubmit={submitNew} aria-labelledby="project-new-title">
          <h4 id="project-new-title">New project</h4>
          <label htmlFor="project-new-name">Project name <span className="optional">(optional)</span></label>
          <input id="project-new-name" ref={newNameInput} value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeCreate(); } }}
            aria-describedby="project-new-hint" placeholder="For example, Kopi Senja" disabled={busy} />
          <small id="project-new-hint">You can skip this; it shows as “Untitled project” until you rename it.</small>
          {createError && <p className="error" role="alert">{createError}</p>}
          <div className="project-card-actions">
            <button type="submit" className="account-submit" disabled={busy}>Create project</button>
            <button type="button" className="account-toggle" onClick={closeCreate} disabled={busy}>Cancel</button>
          </div>
        </form>}
        {workspace.projects.length === 0 && !creating && <p className="workspace-empty">No projects yet. Create one for each business you run, or ask your assistant above to set one up.</p>}
        {workspace.projects.length > 0 && <ul className="project-grid">
          {workspace.projects.map((project) => <ProjectCard key={project.id} project={project} busy={busy} onRename={rename} />)}
        </ul>}
      </section>
    </main>
  </div>;
}
