import { useQuery } from "@tanstack/react-query";
import { getUserProjects, getProjectById, canAccessProject } from "@/lib/services/projects";
import { supabaseServices } from "@/lib/services";
import type { Project } from "@/lib/mock-data";

export function useUserProjects(userId: string | null) {
  return useQuery<Project[], Error>({
    queryKey: ["user-projects", userId],
    queryFn: () => {
      if (!userId) throw new Error("User ID is required");
      return getUserProjects(userId);
    },
    enabled: !!userId,
  });
}

export function useProject(projectId: string | null) {
  return useQuery<Project | null, Error>({
    queryKey: ["project", projectId],
    queryFn: () => {
      if (!projectId) throw new Error("Project ID is required");
      return getProjectById(projectId);
    },
    enabled: !!projectId,
  });
}

export function useProjectAccess(userId: string | null, projectId: string | null) {
  return useQuery<boolean, Error>({
    queryKey: ["project-access", userId, projectId],
    queryFn: () => {
      if (!userId || !projectId) throw new Error("User ID and Project ID are required");
      return canAccessProject(userId, projectId);
    },
    enabled: !!userId && !!projectId,
  });
}

export function useProjectMembers(projectId: string | null) {
  return useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => {
      if (!projectId) throw new Error("Project ID is required");
      return supabaseServices.projectMembers.list(projectId);
    },
    enabled: !!projectId,
  });
}
