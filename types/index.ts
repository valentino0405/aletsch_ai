export interface Project {
  _id?: string;
  name: string;
  repositoryUrl: string;
  branch: string;
  ownerId: string; // Clerk User ID
  status: "Connected" | "Syncing" | "Disconnected";
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  _id?: string;
  projectId: string;
  url: string;
  branch: string;
  stars?: number;
  forks?: number;
  language?: string;
  lastSyncedAt?: string;
}

export interface Event {
  _id?: string;
  projectId: string;
  eventName: string;
  category: "Interaction" | "Form" | "Pageview" | "System" | "Conversion";
  path: string;
  selector?: string;
  userId: string;
  occurrences: number;
  lastSeen: string;
}

export interface Funnel {
  _id?: string;
  projectId: string;
  name: string;
  steps: {
    order: number;
    name: string;
    targetSelector?: string;
    expectedUsers: number;
    actualUsers: number;
  }[];
  createdAt: string;
}

export interface Insight {
  _id?: string;
  projectId: string;
  type: "critical" | "opportunity" | "positive" | "behavior";
  title: string;
  description: string;
  recommendation?: string;
  createdAt: string;
}

export interface AnalysisJob {
  _id?: string;
  projectId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  currentStep: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface Alert {
  _id?: string;
  projectId: string;
  title: string;
  description: string;
  severity: "Critical" | "Warning";
  category: string;
  time: string;
  createdAt: string;
}

export interface UserSession {
  _id?: string;
  sessionId: string;
  projectId: string;
  userId: string; // or anonymousId
  anonymousId?: string;
  startedAt: string;
  lastActivityAt: string;
  eventCount: number;
  entryPath?: string;
  exitPath?: string;
}

