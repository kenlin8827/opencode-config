import type { CompressOptions, CompressResult, Message, Summarizer } from './types.js';
/** Default token counter: ~3.5 chars/token heuristic. */
export declare function defaultTokenCounter(msg: Message): number;
/**
 * Compress a message array. Sync by default; async when a `summarizer` is provided.
 *
 * The caller MUST persist `messages` and `verbatim` atomically.
 * Partial writes (e.g. storing compressed messages without their
 * verbatim originals) will cause data loss that `uncompress()`
 * surfaces via `missing_ids`.
 */
export declare function compress(messages: Message[], options?: CompressOptions): CompressResult;
export declare function compress(messages: Message[], options: CompressOptions & {
    summarizer: Summarizer;
}): Promise<CompressResult>;
//# sourceMappingURL=compress.d.ts.map