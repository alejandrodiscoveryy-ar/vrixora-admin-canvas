import { getSupabaseClient } from "../supabase";
import type { Project } from "../mock-data";

export interface SupabaseProject {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "planning" | "paused";
  created_at: string;
  color: string;
  icon_url: string | null;
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const client = getSupabaseClient();

  const { data: projects, error } = await client
    .from("projects")
    .select("id, name, slug, description, status, created_at, color, icon_url")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user projects:", error);
    throw error;
  }

  return (projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: project.status,
    createdAt: project.created_at,
    color: project.color,
    iconUrl: project.icon_url ?? null,
  }));
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("projects")
    .select("id, name, slug, description, status, created_at, color, icon_url")
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
    iconUrl: data.icon_url ?? null,
  };
}

export async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  const client = getSupabaseClient();

  const { data, error } = await client.from("projects").select("id").eq("id", projectId).single();

  if (error && error.code !== "PGRST116") {
    console.error("Error checking project access:", error);
    return false;
  }

  return !!data;
}
