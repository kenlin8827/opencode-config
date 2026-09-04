import type { UncompressOptions, UncompressResult, Message, VerbatimMap } from './types.js';
export type StoreLookup = VerbatimMap | ((id: string) => Message | undefined);
/**
 * Restore original messages from compressed output using a verbatim store.
 *
 * Non-empty `missing_ids` in the result indicates data loss — typically
 * from a non-atomic write where compressed messages were persisted but
 * their verbatim originals were not.
 */
export declare function uncompress(messages: Message[], store: StoreLookup, options?: UncompressOptions): UncompressResult;
//# sourceMappingURL=expand.d.ts.map