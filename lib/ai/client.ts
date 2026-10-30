export interface AIServiceResponse {
  success: boolean;
  content?: string;
  error?: string;
  /** The model that actually produced the content, once one succeeded. */
  model?: string;
}

/**
 * Clean AIService client communicating with OpenRouter gateway
 */
export class AIService {
  /**
   * Models tried, in order, when the configured one is unavailable.
   *
   * Individual free model slugs retire without notice. The gateway's
   * free router selects an available model instead of pinning another
   * retiring slug. Keep the developer's configured model first.
   */
  private static readonly FALLBACK_MODELS = [
    "openrouter/free",
  ];

  /** Slugs this process has already seen rejected as unavailable. */
  private static unavailable = new Set<string>();

  private static getApiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  }

  /** The configured model first, then the fallbacks, minus dead slugs. */
  private static getModelChain(): string[] {
    const configured = process.env.AI_MODEL?.trim();
    const chain = configured ? [configured, ...this.FALLBACK_MODELS] : [...this.FALLBACK_MODELS];
    const deduped = Array.from(new Set(chain)).filter((m) => !this.unavailable.has(m));
    // If every candidate has been marked dead, try the configured one
    // again rather than returning nothing — the outage may be over.
    return deduped.length > 0 ? deduped : chain.slice(0, 1);
  }

  /**
   * Helper to verify if AI credentials are fully present
   */
  public static isConfigured(): boolean {
    return !!this.getApiKey();
  }

  /**
   * General-purpose text generation via OpenRouter API
   */
  public static async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number; jsonMode?: boolean }
  ): Promise<AIServiceResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: "OpenRouter API Key (OPENROUTER_API_KEY) is not configured." };
    }

    let lastError = "No model candidates were available.";

    for (const model of this.getModelChain()) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(Math.max(1, Math.min(options?.timeoutMs ?? 15_000, 60_000))),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://aletsch.ai", // Required by OpenRouter rules
            "X-Title": "Aletsch AI Analytics",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: options?.temperature ?? 0.2,
            max_tokens: options?.maxTokens ?? 1500,
            response_format: options?.jsonMode ? {type: "json_object"} : undefined,
            reasoning: options?.jsonMode ? {exclude: true} : undefined,
          }),
        });

        if (!response.ok) {
          lastError = `OpenRouter status ${response.status} for "${model}".`;

          // 404 means the slug no longer exists (or is no longer free);
          // 429 means this model is rate-limited right now. Both are
          // worth retrying on the next candidate. Anything else (401,
          // 402, 500) is about the account or the gateway, so trying
          // another model would just repeat the same failure.
          if (response.status === 404) {
            this.unavailable.add(model);
            console.warn(`[AIService] Model "${model}" is unavailable; trying the next candidate.`);
            continue;
          }
          if (response.status === 429) {
            console.warn(`[AIService] Model "${model}" is rate-limited; trying the next candidate.`);
            continue;
          }
          return { success: false, error: lastError };
        }

        const json = await response.json();
        const choice = json.choices?.[0]?.message?.content;
        if (typeof choice !== "string" || !choice.trim()) {
          lastError = `OpenRouter returned an empty message response from "${model}".`;
          continue;
        }

        return { success: true, content: choice, model };
      } catch (e: unknown) {
        lastError = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "AI request timed out." : "AI network request failed.";
        console.error("[AIService]", lastError);
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Sends structured JSON prompts and handles parsing safety checks
   */
  public static async generateStructured<T>(
    systemPrompt: string,
    userPrompt: string,
    validator: (data: any) => T | null
  ): Promise<T | null> {
    const formattedSystemPrompt = `${systemPrompt}\nIMPORTANT: You must respond with a raw JSON object ONLY. Do not enclose the output in markdown code blocks like \`\`\`json. If the requested result is an array, wrap it as {"interactions": [...]}. Output clean valid JSON structure matching requirements.`;

    const response = await this.generateText(formattedSystemPrompt, userPrompt, {jsonMode: true, maxTokens: 4096});
    if (!response.success || !response.content) {
      return null;
    }

    try {
      // Clean possible leading/trailing markdown characters if model hallucinates
      let rawJson = response.content.trim();
      if (rawJson.startsWith("```")) {
        rawJson = rawJson.replace(/^```(json)?/, "").replace(/```$/, "").trim();
      }

      const parsed = JSON.parse(rawJson);
      return validator(parsed);
    } catch {
      console.error("[AIService] Response did not match the JSON contract.");
      return null;
    }
  }

  /**
   * Answers "is the AI layer actually working right now?" with a real
   * request rather than a key-presence check.
   *
   * `isConfigured()` only proves a key exists. It returned true for
   * weeks while every call 404'd on a retired model slug, so the UI
   * reported the AI engine as operational while nothing was reaching a
   * model. This is what System Health should be asking.
   */
  public static async checkHealth(): Promise<{
    configured: boolean;
    reachable: boolean;
    model?: string;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        reachable: false,
        error: "OPENROUTER_API_KEY is not set.",
      };
    }

    const probe = await this.generateText("Reply with the single word OK.", "OK", {
      maxTokens: 5,
    });

    return {
      configured: true,
      reachable: probe.success,
      model: probe.model,
      error: probe.error,
    };
  }
}
