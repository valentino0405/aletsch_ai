import {parseFile} from "@/lib/ast/interaction-detector";
import {isValidEventName} from "@/lib/ai/intent-classifier";
import {detectFramework} from "@/lib/ingestion/framework-detector";
import {instrumentFile} from "./codemod";
import {validateInstrumentedFile} from "./validator";
import {createFileDiff} from "./diff";

/** Legacy snippet previews use the same safe AST transform as apply. */
export function createInstrumentationPreview(filePath: string, source: string, eventName: string) {
  if (!isValidEventName(eventName)) throw new Error("The recommended event name is invalid. Re-run analysis.");
  const path = /\.(tsx|jsx)$/.test(filePath) ? filePath : "preview.tsx";
  const parsed = parseFile(path, source);
  if (!parsed.success) throw new Error("The stored snippet is incomplete or unsupported. Re-run analysis to preview instrumentation.");
  const framework = detectFramework({filePaths:[path],manifests:{}});
  const result = instrumentFile(path, source, parsed.interactions.map(i=>({...i.metadata,eventName,lineNumber:i.lineNumber,tagName:String(i.metadata?.tagName),interactionType:i.type,componentName:i.componentName,label:i.label,properties:{}})),{framework});
  const validation = validateInstrumentedFile(result);
  if (!validation.valid) throw new Error("This snippet cannot be instrumented safely.");
  return {filePath,originalCode:source,instrumentedCode:result.instrumentedContent,diff:createFileDiff(source,result.instrumentedContent,{filePath}).unified};
}
