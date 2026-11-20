"use client";

import { useParams } from "next/navigation";
import { isProjectId } from "../services/project";

/** The project id from the route (/projects/[projectId]/...), for links in a project page; "" outside one. */
export function useProjectId(): string {
  const params = useParams<{ projectId?: string }>();
  if (isProjectId(params?.projectId)) return params.projectId;
  return "";
}
