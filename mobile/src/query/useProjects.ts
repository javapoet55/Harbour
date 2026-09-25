import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { endpoints, type NexdoProject, type ProjectInput, type ProjectsResponse } from '../api';
import { queryKeys } from './keys';
import { bumpRevision } from './taskRevision';

/**
 * Projects. Ports the project methods on `AppModel` and `ProjectQuery`
 * (ios/Sources/NexdoCore/Projects.swift).
 */

/** `GET /api/projects` — the list plus the count of tasks with no project. */
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.all(),
    queryFn: () => endpoints.projects(),
  });
}

export function useProject(id: string | undefined): NexdoProject | undefined {
  const { data } = useProjects();
  return id ? data?.projects.find((project) => project.id === id) : undefined;
}

function writeProject(previous: ProjectsResponse | undefined, project: NexdoProject): ProjectsResponse {
  const projects = previous?.projects ?? [];
  const exists = projects.some((item) => item.id === project.id);
  return {
    projects: exists ? projects.map((item) => (item.id === project.id ? project : item)) : [...projects, project],
    unassignedTaskCount: previous?.unassignedTaskCount ?? 0,
  };
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation<NexdoProject, Error, ProjectInput>({
    mutationFn: async (input) => (await endpoints.createProject(input)).project,
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectsResponse>(queryKeys.projects.all(), (previous) => writeProject(previous, project));
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation<NexdoProject, Error, { id: string; input: ProjectInput }>({
    mutationFn: async ({ id, input }) => (await endpoints.updateProject(id, input)).project,
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectsResponse>(queryKeys.projects.all(), (previous) => writeProject(previous, project));
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, string>({
    mutationFn: async (id) => {
      await endpoints.deleteProject(id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<ProjectsResponse>(queryKeys.projects.all(), (previous) =>
        previous ? { ...previous, projects: previous.projects.filter((project) => project.id !== id) } : previous,
      );
      // Deleting a project unassigns its tasks, so every cached task is now suspect.
      bumpRevision();
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    },
  });
}
