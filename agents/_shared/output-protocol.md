## Output protocol (mandatory)

Applies to all explanation, summary, and analysis output (not code itself).

### Conclusion first
First sentence states the core conclusion with confidence level and one-line rationale.
Format: `**Conclusion**: <one sentence> (Confidence: High/Medium/Low — <reason>)`

### Visual overview
Prefer diagrams over prose. Architecture → Mermaid structure diagrams, flows → Mermaid flowcharts, comparisons → tables, data → charts.

### Layered exposition
Organize body in three layers, each independently readable:
- **Summary** (1-3 sentences: conclusion + key numbers)
- **Key points** (one sentence each, numbered)
- **Details** (expansion, skippable)

### Content labeling
Label all key content as one of three types:
- [Fact] — verifiable (code, docs, test results)
- [Inference] — derived from known information
- [Assumption] — unverified, needs validation

Assumptions get their own section: `## Assumptions (to confirm)`

### Counterargument
Each key conclusion gets one line: `> Counter: This conclusion fails when <condition>, because <reason>.`

### Decision checklist
End with:
```
## Decisions to confirm
1. [ ] <decision point> — Agree/Modify?
```
User replies Agree or Modify per item.

### Verifiable data
Cite sources for all data (file paths, URLs, test output). Show calculation steps, not just results.

### Concise language
Max 30 words per sentence. One idea per paragraph. Explain jargon on first use in one sentence.

### Optional analogy
Complex concepts may include an analogy in a `> 💡 Analogy: ...` callout, not in the main body.
