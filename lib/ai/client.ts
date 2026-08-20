export interface AIServiceResponse {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Clean AIService client communicating with OpenRouter gateway
 */
export class AIService {
  private static getApiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  }

  private static getModel(): string {
    return process.env.AI_MODEL || "openrouter/free";
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
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<AIServiceResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: "OpenRouter API Key (OPENROUTER_API_KEY) is not configured." };
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aletsch.ai", // Required by OpenRouter rules
          "X-Title": "Aletsch AI Analytics",
        },
        body: JSON.stringify({
          model: this.getModel(),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 1500,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `OpenRouter API status error ${response.status}: ${errText}` };
      }

      const json = await response.json();
      const choice = json.choices?.[0]?.message?.content;
      if (!choice) {
        return { success: false, error: "OpenRouter returned an empty message response." };
      }

      return { success: true, content: choice };
    } catch (e: any) {
      console.error("AI Request Failed:", e);
      return { success: false, error: e.message || "Unknown network communication error." };
    }
  }

  /**
   * Sends structured JSON prompts and handles parsing safety checks
   */
  public static async generateStructured<T>(
    systemPrompt: string,
    userPrompt: string,
    validator: (data: any) => T | null
  ): Promise<T | null> {
    const formattedSystemPrompt = `${systemPrompt}\nIMPORTANT: You must respond with a raw JSON block ONLY. Do not enclose the output in markdown code blocks like \`\`\`json. Output clean valid JSON structure matching requirements.`;

    const response = await this.generateText(formattedSystemPrompt, userPrompt);
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
    } catch (err) {
      console.error("AI Response JSON parsing failed. Content was: ", response.content, err);
      return null;
    }
  }
}
