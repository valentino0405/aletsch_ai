import { Project, SyntaxKind, Node } from "ts-morph";

export interface ParsedComponent {
  name: string;
  type: string;
  filePath: string;
}

export function parseComponentTree(files: { path: string; content: string }[]): ParsedComponent[] {
  const project = new Project({
    useInMemoryFileSystem: true,
  });

  files.forEach(file => {
    // Basic filter for TS/TSX files
    if (file.path.endsWith(".ts") || file.path.endsWith(".tsx") || file.path.endsWith(".jsx") || file.path.endsWith(".js")) {
      project.createSourceFile(file.path, file.content);
    }
  });

  const parsedComponents: ParsedComponent[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    // Find all JSX Elements
    const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
    const jsxSelfClosingElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
    
    const allJsx = [...jsxElements, ...jsxSelfClosingElements];

    allJsx.forEach(jsxNode => {
      let tagName = "";
      
      if (Node.isJsxElement(jsxNode)) {
        tagName = jsxNode.getOpeningElement().getTagNameNode().getText();
      } else if (Node.isJsxSelfClosingElement(jsxNode)) {
        tagName = jsxNode.getTagNameNode().getText();
      }

      if (tagName === "button" || tagName === "Button") {
        parsedComponents.push({
          name: tagName,
          type: "CTA Button",
          filePath: sourceFile.getFilePath(),
        });
      } else if (tagName === "form" || tagName === "Form") {
         parsedComponents.push({
          name: tagName,
          type: "Form Block",
          filePath: sourceFile.getFilePath(),
        });
      }
    });

    // Detect Page Layouts based on Next.js conventions
    const path = sourceFile.getFilePath();
    if (path.includes("/pages/") || path.includes("/app/") && (path.endsWith("page.tsx") || path.endsWith("layout.tsx"))) {
      parsedComponents.push({
        name: sourceFile.getBaseName(),
        type: "Page Layout",
        filePath: path,
      });
    }
  }

  // Deduplicate
  const unique = new Map<string, ParsedComponent>();
  parsedComponents.forEach(c => unique.set(c.filePath + c.name + c.type, c));
  
  return Array.from(unique.values());
}
