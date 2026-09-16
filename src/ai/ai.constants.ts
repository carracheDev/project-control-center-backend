export const GROQ_CLIENT = Symbol('GROQ_CLIENT');

export interface GroqClient {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: Array<{ role: 'system' | 'user'; content: string }>;
        temperature: number;
        max_tokens: number;
        signal: AbortSignal;
      }) => Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}
