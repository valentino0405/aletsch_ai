import { parseGitHubUrl, getRawFileContent } from "./github";

export interface ComponentMetadata {
  name: string;
  type: "Page" | "Layout" | "Form" | "Button" | "Navigation" | "Modal" | "Input" | "Unknown";
  filePath: string;
  route: string;
  elementText?: string;
  codeSnippet: string;
  handlers: string[];
}

export interface AnalyzedProject {
  routes: string[];
  components: ComponentMetadata[];
}

/**
 * Extracts route path from a Next.js file path pattern (App Router)
 * e.g., app/dashboard/page.tsx -> /dashboard
 * e.g., app/projects/[id]/page.tsx -> /projects/[id]
 */
export function getRouteFromPath(filePath: string): string {
  if (!filePath.startsWith("app/")) {
    return "Component File";
  }
  
  let route = filePath.replace("app/", "/");
  route = route.substring(0, route.lastIndexOf("/"));
  
  // Handle (auth) groups or other Next.js specific folder names
  route = route.replace(/\/\([^)]+\)/g, "");
  
  // Root page
  if (route === "") {
    route = "/";
  }
  
  return route;
}

/**
 * Performs deterministic analysis of React/TypeScript file contents
 */
export function analyzeSourceContent(filePath: string, content: string): ComponentMetadata[] {
  const components: ComponentMetadata[] = [];
  const route = getRouteFromPath(filePath);

  // 1. Detect Forms
  // Matches <form ...> to </form>
  const formRegex = /<form[\s\S]*?>([\s\S]*?)<\/form>/g;
  let formMatch;
  while ((formMatch = formRegex.exec(content)) !== null) {
    const fullForm = formMatch[0];
    const formBody = formMatch[1];
    
    // Find inputs inside the form
    const inputs: string[] = [];
    const inputRegex = /<input[\s\S]*?name=["'](.*?)["']/g;
    let inputMatch;
    while ((inputMatch = inputRegex.exec(fullForm)) !== null) {
      inputs.push(inputMatch[1]);
    }

    // Try to guess form purpose
    let formName = "FormBlock";
    if (fullForm.includes("login") || fullForm.includes("signIn")) {
      formName = "LoginForm";
    } else if (fullForm.includes("signUp") || fullForm.includes("register")) {
      formName = "SignUpForm";
    } else if (fullForm.includes("project") || fullForm.includes("repo")) {
      formName = "CreateProjectForm";
    }

    components.push({
      name: formName,
      type: "Form",
      filePath,
      route,
      codeSnippet: fullForm.substring(0, 300), // excerpt
      handlers: ["onSubmit"],
      elementText: `Inputs: ${inputs.join(", ")}`
    });
  }

  // 2. Detect Buttons / CTAs
  // Matches <button ...>Text</button> or <Button ...>Text</Button> or elements with onClick
  const buttonRegex = /<(button|Button)[\s\S]*?>([\s\S]*?)<\/\1>/g;
  let btnMatch;
  while ((btnMatch = buttonRegex.exec(content)) !== null) {
    const fullBtn = btnMatch[0];
    const btnText = btnMatch[2].replace(/<[^>]*>/g, "").trim().substring(0, 50);
    
    // Skip if button has no readable text or is layout template
    if (!btnText && !fullBtn.includes("onClick")) continue;

    // Detect click handler name
    const handlerMatch = fullBtn.match(/onClick\s*=\s*\{([^}]+)\}/);
    const handlers = handlerMatch ? [handlerMatch[1].trim()] : [];

    components.push({
      name: btnText ? btnText.replace(/[^a-zA-Z0-9]/g, "") + "Button" : "CTAButton",
      type: "Button",
      filePath,
      route,
      elementText: btnText || "Icon Button",
      codeSnippet: fullBtn,
      handlers
    });
  }

  // 3. Detect Navigation / Links
  // Matches <Link href="..." or router.push
  const linkRegex = /<(Link|a)[\s\S]*?href=["'](.*?)["'][\s\S]*?>([\s\S]*?)<\/\1>/g;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(content)) !== null) {
    const fullLink = linkMatch[0];
    const href = linkMatch[2];
    const linkText = linkMatch[3].replace(/<[^>]*>/g, "").trim().substring(0, 50);

    if (href.startsWith("http")) continue; // Skip external links for routing mapping

    components.push({
      name: linkText ? linkText.replace(/[^a-zA-Z0-9]/g, "") + "Link" : "NavigationLink",
      type: "Navigation",
      filePath,
      route,
      elementText: `href: ${href} (${linkText || "Anchor"})`,
      codeSnippet: fullLink,
      handlers: ["onClick"]
    });
  }

  return components;
}

/**
 * Runs repository-wide deterministic source analysis mapping pages, forms, and components
 */
export async function analyzeRepository(
  owner: string,
  repo: string,
  branch: string,
  filePaths: string[]
): Promise<AnalyzedProject> {
  const routesSet = new Set<string>();
  const components: ComponentMetadata[] = [];

  // Limit processing to 15 key source files to avoid API limits and token bloating
  const keyFiles = filePaths.filter(f => f.includes("app/") || f.includes("components/")).slice(0, 15);

  for (const filePath of keyFiles) {
    try {
      const content = await getRawFileContent(owner, repo, branch, filePath);
      
      // Track page routes
      if (filePath.endsWith("page.tsx") || filePath.endsWith("page.js")) {
        routesSet.add(getRouteFromPath(filePath));
      }

      // Analyze page/component elements
      const detected = analyzeSourceContent(filePath, content);
      components.push(...detected);
    } catch (err) {
      console.error(`Failed to analyze file: ${filePath}`, err);
    }
  }

  return {
    routes: Array.from(routesSet),
    components
  };
}
