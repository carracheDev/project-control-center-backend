export const GEMINI_CLIENT = Symbol('GEMINI_CLIENT');

export interface GeminiClient {
  models: {
    generateContent: (params: {
      model: string;
      contents: string;
      config: {
        systemInstruction: string;
        responseMimeType: string;
        responseJsonSchema: Record<string, unknown>;
        temperature: number;
        maxOutputTokens: number;
        abortSignal: AbortSignal;
      };
    }) => Promise<{ text?: string }>;
  };
}
