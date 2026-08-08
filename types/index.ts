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
