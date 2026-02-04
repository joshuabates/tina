---
name: analytics
description: Use when you need to answer questions, investigate hunches, or understand patterns in code or data - specific questions, vague concerns, or understanding goals
---

# Analytics

Answer questions and discover patterns through hands-on data analysis.

**Core principle:** Show your work, interpret findings, validate direction.

**Announce at start:** "I'm using the analytics skill to investigate this."

## Phase 1: Understanding Intent

**Clarify what they're trying to learn** (if not obvious from context).

Entry points:
- Specific question: "Why did error rates spike?"
- Vague hunch: "Something feels off with signups"
- Understanding goal: "I need to understand API usage"

**Don't ask about data sources when obvious** from the question.

## Phase 2: Orientation

**Spawn researcher to explore data landscape:**

```yaml
Task:
  subagent_type: tina:researcher
  prompt: |
    Orientation for analytics on: {topic/question}

    Find:
    - Relevant data sources (tables, files, APIs, logs)
    - Schema/structure of data
    - How data flows into these sources
    - Related logging/metrics systems
  hints: ["code-structure", "data-flow"]
```

**Researcher returns:**
- Data sources relevant to the question
- Schema and structure
- Data flow paths
- Related systems

**Then ask about domain meaning when necessary:**

You now know the structure. Ask about meaning:
- "Column `status` has values 1-5. What do they mean?"
- "Table `events` - what triggers writes here?"

Ask about meaning, not structure.

## Phase 3: Active Investigation

**Write and execute queries, scripts, or analysis code.**

With orientation complete, do hands-on investigation:

For code analysis:
- `git log`, `git blame` - change history
- Dependency analysis - imports, call graphs
- Complexity metrics - function length, nesting

For data:
- SQL queries for databases
- Scripts to parse CSV/JSON
- API calls to live systems

**For complex investigations, spawn additional research:**

```yaml
# If you need historical context
Task:
  subagent_type: tina:researcher
  prompt: "How has {metric} changed over time? What code changes correlate?"
  hints: ["git-history", "data-flow"]
```

Build understanding incrementally.

## Phase 4: Incremental Presentation

**Present findings in chunks:**

1. Show the data (query results, metrics, patterns)
2. Offer interpretation (what this means)
3. Check: "Does this answer your question, or should I dig deeper?"

Adjust direction based on feedback.

**Don't:**
- Dump raw data without interpretation
- Keep digging past the answer
- Present everything at once

## Phase 5: Synthesis

**Summarize answers with supporting evidence.**

**Include actual queries/scripts** so analysis is reproducible.

Write report if findings warrant: `docs/analytics/YYYY-MM-DD-<topic>.md`

Report structure:
- Question/goal
- Summary (2-3 sentences)
- Methodology
- Detailed findings with evidence
- Conclusions and actions

Commit to git.

## Outputs

**Primary: Answers with evidence**
- The answer
- Supporting evidence (data/queries)
- Confidence level and caveats
- Related findings discovered

**Secondary: Written report** (when warranted)

## Red Flags

If you catch yourself:
- **Diving in without understanding intent** → Clarify what they want to learn first.
- **Dumping raw data** → Interpret what it means.
- **Showing results without queries** → Include commands for reproducibility.
- **Digging past the answer** → Stop when question is answered.
- **Not validating direction** → Check if you're on track after initial findings.

## Key Principles

- **Show your work** - data alongside interpretation
- **Interpret, don't dump** - explain what data means
- **Ask about meaning, not structure** - you can read schemas
- **Validate direction early** - check if on track
- **Reproducibility matters** - include queries/scripts
- **Know when to stop** - answer the question, then stop
- **Surface anomalies** - mention unexpected findings
