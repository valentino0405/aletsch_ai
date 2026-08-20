export interface GitHubRepoMeta {
  name: string;
  owner: string;
  defaultBranch: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
}

export interface GitHubFile {
  path: string;
  type: "blob" | "tree";
  url: string;
}

/**
 * Utility helper to parse GitHub repository URL
 */
export function parseGitHubUrl(url: string) {
  const cleaned = url.replace(/(https?:\/\/)?(www\.)?github\.com\//, "");
  const parts = cleaned.split("/");
  if (parts.length < 2) {
    throw new Error("Invalid GitHub repository URL pattern.");
  }
  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/, ""),
  };
}

/**
 * Fetch public metadata of a repository from GitHub API
 */
export async function getRepoMetadata(owner: string, repo: string): Promise<GitHubRepoMeta> {
  const token = process.env.GITHUB_TOKEN;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Aletsch-AI-Client",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(url, { headers, next: { revalidate: 60 } });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`GitHub repository "${owner}/${repo}" not found or private.`);
    }
    throw new Error(`GitHub API returned status ${response.status}`);
  }

  const data = await response.json();
  return {
    name: data.name,
    owner: data.owner.login,
    defaultBranch: data.default_branch || "main",
    description: data.description || "",
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    language: data.language || "TypeScript",
  };
}

/**
 * Fetch repository branches list
 */
export async function getRepoBranches(owner: string, repo: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Aletsch-AI-Client",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error("Failed to fetch repository branches from GitHub API.");
  }

  const data = await response.json();
  return data.map((b: any) => b.name);
}

/**
 * Fetch recursive file tree for a repository branch
 */
export async function getRepoFileTree(owner: string, repo: string, branch: string): Promise<GitHubFile[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Aletsch-AI-Client",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  // Get current tree using recursive API starting from the target branch SHA
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to load repository file tree for branch "${branch}".`);
  }

  const data = await response.json();
  if (!data.tree) {
    return [];
  }

  return data.tree.map((t: any) => ({
    path: t.path,
    type: t.type === "tree" ? "tree" : "blob",
    url: t.url,
  }));
}

/**
 * Downloads file raw content from GitHub
 */
export async function getRawFileContent(owner: string, repo: string, branch: string, path: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "Aletsch-AI-Client",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${path}`);
  }

  return response.text();
}
