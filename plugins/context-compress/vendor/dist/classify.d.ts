export type ClassifyResult = {
    decision: 'T0' | 'T2' | 'T3';
    confidence: number;
    reasons: string[];
};
export declare function classifyMessage(content: string): ClassifyResult;
//# sourceMappingURL=classify.d.ts.map