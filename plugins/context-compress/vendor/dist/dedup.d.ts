import type { Message } from './types.js';
export type DedupAnnotation = {
    duplicateOfIndex: number;
    contentLength: number;
    similarity?: number;
};
/**
 * Scan messages for exact content duplicates. Returns a map of message indices
 * to their dedup annotations (marking earlier occurrences for replacement).
 *
 * Skips hard-preserved messages: system role, tool_calls, [summary: prefix,
 * content < 200 chars. Uses djb2 hashing for grouping with full string
 * comparison to eliminate collisions.
 */
export declare function analyzeDuplicates(messages: Message[], recencyStart: number, preserveRoles: Set<string>): Map<number, DedupAnnotation>;
/**
 * Scan messages for near-duplicate content using line-level Jaccard similarity.
 * Returns a map of message indices to their fuzzy-dedup annotations.
 *
 * Complexity: O(n^2) in the worst case (all messages land in one fingerprint
 * bucket), but effectively O(n * k) in practice due to two pre-filters:
 * 1. Length-ratio filter: skip pairs where min/max length ratio < 0.7
 * 2. Line-fingerprint bucketing: group by first 5 non-empty normalized lines
 *    (requires >= 3 shared lines to be in the same bucket)
 */
export declare function analyzeFuzzyDuplicates(messages: Message[], recencyStart: number, preserveRoles: Set<string>, exactAnnotations: Map<number, DedupAnnotation>, threshold: number): Map<number, DedupAnnotation>;
//# sourceMappingURL=dedup.d.ts.map