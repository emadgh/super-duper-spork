import type {
  ActionTemplateSummary,
  LoadedProject,
  PackagePresetSummary,
  ProjectManifest,
  ProjectPackageState,
  ProjectSummary,
} from "./model.ts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((body as { error?: string }).error || response.statusText);
  }
  return await response.json() as T;
}

export const api = {
  listProjects(): Promise<ProjectSummary[]> { return request<ProjectSummary[]>("/api/projects"); },
  listActionTemplates(): Promise<ActionTemplateSummary[]> { return request<ActionTemplateSummary[]>("/api/action-library"); },
  listPackagePresets(): Promise<PackagePresetSummary[]> { return request<PackagePresetSummary[]>("/api/package-library"); },
  loadProject(projectId: string): Promise<LoadedProject> { return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}`); },
  createProject(name: string): Promise<LoadedProject> {
    return request<LoadedProject>("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
  },
  buildProject(projectId: string): Promise<{ ok: true; projectId: string; output: string }> {
    return request<{ ok: true; projectId: string; output: string }>(`/api/projects/${encodeURIComponent(projectId)}/build`, {
      method: "POST", body: JSON.stringify({}),
    });
  },
  addObject(projectId: string, name: string, folder = ""): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/objects`, {
      method: "POST", body: JSON.stringify({ name, folder }),
    });
  },
  addStyle(projectId: string, name: string): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/styles`, {
      method: "POST", body: JSON.stringify({ name }),
    });
  },
  saveStyle(projectId: string, file: string, source: string): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/styles/${encodeURIComponent(file)}`, {
      method: "PUT", body: JSON.stringify({ source }),
    });
  },
  addPackagePreset(projectId: string, presetId: string): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/packages/presets`, {
      method: "POST", body: JSON.stringify({ presetId }),
    });
  },
  removePackage(projectId: string, packageId: string): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(packageId)}`, {
      method: "DELETE", body: JSON.stringify({}),
    });
  },
  installPackages(projectId: string): Promise<{ packages: ProjectPackageState; output: string }> {
    return request<{ packages: ProjectPackageState; output: string }>(`/api/projects/${encodeURIComponent(projectId)}/packages/install`, {
      method: "POST", body: JSON.stringify({}),
    });
  },
  addActionTemplate(projectId: string, templateId: string, folder = ""): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/action-library`, {
      method: "POST", body: JSON.stringify({ templateId, folder }),
    });
  },
  addObjectFolder(projectId: string, name: string, parent = ""): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/folders`, {
      method: "POST", body: JSON.stringify({ name, parent }),
    });
  },
  moveObject(projectId: string, file: string, folder: string): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/objects/${encodeURIComponent(file)}/move`, {
      method: "POST", body: JSON.stringify({ folder }),
    });
  },
  revealProject(projectId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}/reveal`, { method: "POST", body: JSON.stringify({}) });
  },
  revealObject(projectId: string, file: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}/reveal`, {
      method: "POST", body: JSON.stringify({ objectFile: file }),
    });
  },
  saveObject(projectId: string, file: string, source: string): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}/objects/${encodeURIComponent(file)}`, {
      method: "PUT", body: JSON.stringify({ source }),
    });
  },
  saveManifest(projectId: string, manifest: ProjectManifest): Promise<LoadedProject> {
    return request<LoadedProject>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PUT", body: JSON.stringify({ manifest }),
    });
  },
};
