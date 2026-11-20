"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useProjectId } from "../hooks/useProjectId";
import { projectPath } from "../services/project";
import Icon from "./Icon";

type ProjectSummary = { id: string; display_name: string };

/**
 * The project's name at the top left of a project page, with a list of the account's other
 * projects to switch to, and a way back to the workspace. A disclosure of plain links, so every
 * entry is a real link (opens in a new tab, works with the keyboard). Switching keeps the page
 * kind: from one project's Memory to another's Memory.
 */
export default function ProjectSwitcher({ section = "" }: { section?: string }) {
  const projectId = useProjectId();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let current = true;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your projects.");
        const list: ProjectSummary[] = await response.json();
        if (current) setProjects(list);
      })
      .catch((failure) => {
        console.warn("Could not load the project list.", failure);
        if (current) setProjects([]);
      });
    return () => { current = false; };
  }, []);

  // Closes on a click outside, like a native menu.
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  }

  let name = "Project";
  const current = projects?.find((project) => project.id === projectId);
  if (current) name = current.display_name;
  const others = (projects ?? []).filter((project) => project.id !== projectId);

  return <div className="project-switcher" ref={root} onKeyDown={onKey}>
    <button ref={button} type="button" className="project-switcher-button" aria-expanded={open} aria-controls="project-switcher-list"
      onClick={() => setOpen(!open)}>
      <span className="project-switcher-label">Project</span>
      <span className="project-switcher-name">{name}</span>
      <Icon name="chevron" />
    </button>
    <div id="project-switcher-list" className="project-switcher-panel" hidden={!open}>
      {others.length > 0 && <>
        <p className="project-switcher-heading" id="project-switcher-others">Switch to</p>
        <ul aria-labelledby="project-switcher-others">
          {others.map((project) => <li key={project.id}><a href={projectPath(project.id, section)}>{project.display_name}</a></li>)}
        </ul>
      </>}
      <a className="project-switcher-workspace" href="/workspace">All projects</a>
    </div>
  </div>;
}
