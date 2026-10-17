export interface FallbackRepo {
  id: string;
  ownerId: string;
  name: string;
  url: string;
  owner: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  language: string;
  branches: string[];
  lastSyncedAt: string;
  status: string;
}

export interface FallbackProject {
  id: string;
  ownerId: string;
  name: string;
  repositoryUrl: string;
  branch: string;
  language: string;
  status: string;
  events: number;
  lastAnalyzed: string;
  createdAt: string;
  updatedAt: string;
  /** Publishable key authorising POST /api/ingest for this project. */
  writeKey?: string;
}

class FallbackStore {
  private repositories: FallbackRepo[] = [];
  private projects: FallbackProject[] = [];
  private events: any[] = [];
  private analysisJobs: any[] = [];
  private sourceFiles: any[] = [];
  private analysisResults: any[] = [];
  private insights: any[] = [];

  getRepositories(userId: string): FallbackRepo[] {
    return this.repositories.filter((r) => r.ownerId === userId);
  }

  saveRepository(repo: FallbackRepo): FallbackRepo {
    const idx = this.repositories.findIndex((r) => r.url === repo.url && r.ownerId === repo.ownerId);
    if (idx >= 0) {
      this.repositories[idx] = { ...this.repositories[idx], ...repo };
      return this.repositories[idx];
    } else {
      this.repositories.push(repo);
      return repo;
    }
  }

  getProjects(userId: string): FallbackProject[] {
    return this.projects.filter((p) => p.ownerId === userId);
  }

  getProject(id: string, userId: string): FallbackProject | undefined {
    return this.projects.find(
      (p) => (p.id === id || p.repositoryUrl === id) && p.ownerId === userId
    );
  }

  getProjectById(id: string): FallbackProject | undefined {
    return this.projects.find((project) => project.id === id);
  }

  saveProject(project: FallbackProject): FallbackProject {
    const idx = this.projects.findIndex(
      (p) => p.repositoryUrl === project.repositoryUrl && p.ownerId === project.ownerId
    );
    if (idx >= 0) {
      this.projects[idx] = { ...this.projects[idx], ...project };
      return this.projects[idx];
    } else {
      this.projects.push(project);
      return project;
    }
  }

  updateProjectStatus(id: string, status: string) {
    const p = this.projects.find((proj) => proj.id === id);
    if (p) {
      p.status = status;
      p.updatedAt = new Date().toISOString();
    }
  }

  getEvents(userId: string): any[] {
    return this.events.filter((event) => event.ownerId === userId);
  }

  addEvent(event: any) {
    this.events.push(event);
  }

  saveJob(job: any) {
    this.analysisJobs.push(job);
    return job;
  }

  getJob(id: string) {
    return this.analysisJobs.find((j) => j.id === id);
  }

  saveAnalysisJob(job: any) {
    const idx = this.analysisJobs.findIndex((item) => item.id === job.id);
    if (idx >= 0) this.analysisJobs[idx] = { ...this.analysisJobs[idx], ...job };
    else this.analysisJobs.push(job);
    return job;
  }

  getLatestJob(projectId: string) {
    return this.analysisJobs
      .filter((job) => job.projectId === projectId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  }

  saveAnalysisResult(result: any) {
    this.analysisResults = this.analysisResults.filter((item) => item.projectId !== result.projectId);
    this.analysisResults.push(result);
    return result;
  }

  getAnalysisResult(projectId: string) {
    return this.analysisResults.find((result) => result.projectId === projectId);
  }

  saveInsight(insight: any) {
    this.insights = this.insights.filter((item) => item.projectId !== insight.projectId);
    this.insights.push(insight);
    return insight;
  }

  getInsights(projectId?: string) {
    return projectId ? this.insights.filter((item) => item.projectId === projectId) : this.insights;
  }
}

let globalStore = global as typeof globalThis & {
  _fallbackStore?: FallbackStore;
};

if (!globalStore._fallbackStore) {
  globalStore._fallbackStore = new FallbackStore();
} else if (typeof globalStore._fallbackStore.getInsights !== "function") {
  Object.setPrototypeOf(globalStore._fallbackStore, FallbackStore.prototype);
  (globalStore._fallbackStore as any).insights ||= [];
}

export const fallbackStore = globalStore._fallbackStore;
