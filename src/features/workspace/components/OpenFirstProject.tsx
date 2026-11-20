"use client";

import { useEffect } from "react";
import { projectPath } from "@/common/services/project";
import { fetchProjects } from "../services/projects";

/**
 * Old links (/memory, /agents, /apps, /catalogue…) from before projects: open the same page in
 * the account's first project, or the workspace when there is none yet.
 */
export default function OpenFirstProject({ path }: { path: string }) {
  useEffect(() => {
    fetchProjects()
      .then((projects) => {
        if (projects.length === 0) window.location.replace("/workspace");
        else window.location.replace(projectPath(projects[0].id, path) + window.location.hash);
      })
      .catch((failure: Error & { status?: number }) => {
        if (failure.status === 401) window.location.replace("/login");
        else window.location.replace("/workspace");
      });
  }, [path]);
  return <main className="account-screen"><p role="status"><span className="shimmer">Opening your project…</span></p></main>;
}
