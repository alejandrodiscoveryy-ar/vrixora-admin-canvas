import { getSupabaseClient } from "../supabase";
import type { Project } from "./mock-data";

export interface SupabaseProject {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "planning" | "paused";
  created_at: string;
  color: string;
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const client = getSupabaseClient();

  // Obtener proyectos donde el usuario es owner o miembro
  const { data: userProjects, error } = await client
    .from("user_projects")
    .select(
      `
      project_id,
      role,
      projects(id, name, slug, description, status, created_at, color)
    `,
    )
    .eq("user_id", userId)
    .in("role", ["owner", "member"]);

  if (error) {
    console.error("Error fetching user projects:", error);
    throw error;
  }

  if (!userProjects) return [];

  return userProjects.map((up: any) => {
    const project = up.projects;
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
      createdAt: project.created_at,
      color: project.color,
    };
  });
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("projects")
    .select("id, name, slug, description, status, created_at, color")
    .eq("id", projectId)
    .single();

  if (error) {
    console.error("Error fetching project:", error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    status: data.status,
    createdAt: data.created_at,
    color: data.color,
  };
}

export async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("user_projects")
    .select("id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .in("role", ["owner", "member"])
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error checking project access:", error);
    return false;
  }

  return !!data;
}
