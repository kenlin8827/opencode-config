import type { CreateSummarizerOptions, Summarizer } from './types.js';
export declare function createSummarizer(callLlm: (prompt: string) => string | Promise<string>, options?: CreateSummarizerOptions): Summarizer;
export declare function createEscalatingSummarizer(callLlm: (prompt: string) => string | Promise<string>, options?: Omit<CreateSummarizerOptions, 'mode'>): Summarizer;
//# sourceMappingURL=summarizer.d.ts.map