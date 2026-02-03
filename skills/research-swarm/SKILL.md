---
name: research-swarm
description: Use when you need comprehensive research on a topic. Spawns parallel specialized researchers that collaborate, create follow-up tasks, and synthesize findings.
---

# Research Swarm

Parallel collaborative research using specialized agents that can message each other and create follow-up tasks.

**Announce at start:** "I'm using the research-swarm skill to investigate this comprehensively."

## Overview

Spawns a team of specialized researchers:
- **Locator** (haiku) - Fast file finding, returns paths only
- **Analyzer** (opus) - Deep code analysis with file:line references
- **Pattern-finder** (opus) - Finds similar implementations with code snippets
- **Web-researcher** (opus) - External documentation and best practices

Researchers work in parallel, message each other with discoveries, and create follow-up tasks.

## When to Use

- Exploring unfamiliar codebase areas
- Understanding how a feature works across multiple files
- Finding patterns to follow for new implementation
- Comprehensive research before planning
- When you need both internal codebase knowledge AND external best practices

## When NOT to Use

- Simple file lookup (just use Glob/Grep directly)
- You already know what files to read
- Single focused question (spawn one researcher directly)

## The Process

```
1. DECOMPOSE query into research tasks
2. CREATE team and tasks
3. SPAWN researchers (claim tasks automatically)
4. MONITOR for completion and follow-up tasks
5. SYNTHESIZE findings into unified report
```

## Step 1: Decompose Query

Break the research query into parallel tasks by type:

| Task Type | Agent | Example |
|-----------|-------|---------|
| `locate` | tina:locator | "Find files related to authentication" |
| `analyze` | tina:analyzer | "Analyze how JWT validation works in src/auth/" |
| `patterns` | tina:pattern-finder | "Find examples of middleware patterns" |
| `web` | tina:web-researcher | "Research JWT best practices 2026" |

**Initial decomposition heuristics:**
- Always start with a `locate` task for the main topic
- Add `analyze` tasks for specific areas mentioned
- Add `patterns` task if building something new
- Add `web` task if external knowledge needed

## Step 2: Create Team and Tasks

```yaml
# Create team
Teammate:
  operation: spawnTeam
  team_name: "research-{topic}"
  description: "Research swarm for {query}"

# Create initial tasks
TaskCreate:
  subject: "Locate {topic} files"
  description: "Find all files related to {topic}"
  metadata:
    type: "locate"
    query: "{search terms}"

TaskCreate:
  subject: "Analyze {specific area}"
  description: "Deep analysis of {what to understand}"
  metadata:
    type: "analyze"
    files: []  # filled by locator results, or specify if known

TaskCreate:
  subject: "Find {pattern} patterns"
  description: "Find examples of {pattern type}"
  metadata:
    type: "patterns"
    pattern: "{what to find}"

TaskCreate:
  subject: "Research {external topic}"
  description: "Web research for {what to learn}"
  metadata:
    type: "web"
    query: "{search terms}"
```

## Step 3: Spawn Researchers

Spawn one researcher per type. They claim available tasks of their type.

```yaml
# Spawn in parallel (single message with multiple Task calls)
Task:
  subagent_type: tina:locator
  team_name: "research-{topic}"
  name: "locator"
  prompt: "Claim and work on 'locate' type tasks. Message other researchers with relevant discoveries."

Task:
  subagent_type: tina:analyzer
  team_name: "research-{topic}"
  name: "analyzer"
  prompt: "Claim and work on 'analyze' type tasks. Message other researchers with relevant discoveries."

Task:
  subagent_type: tina:pattern-finder
  team_name: "research-{topic}"
  name: "pattern-finder"
  prompt: "Claim and work on 'patterns' type tasks. Message other researchers with relevant discoveries."

Task:
  subagent_type: tina:web-researcher
  team_name: "research-{topic}"
  name: "web-researcher"
  prompt: "Claim and work on 'web' type tasks. Message other researchers with relevant discoveries."
```

## Step 4: Monitor and Handle Messages

Researchers will:
1. Claim tasks matching their type
2. Work on tasks
3. Create follow-up tasks if they discover more to investigate
4. Message each other with relevant findings
5. Mark tasks complete with findings in metadata

**Follow-up task creation by researchers:**

Researchers create new tasks when they discover areas needing investigation:
```yaml
# Example: Locator finds files, creates analyze task
TaskCreate:
  subject: "Analyze auth middleware"
  description: "Locator found auth files. Need deep analysis of middleware pattern."
  metadata:
    type: "analyze"
    files: ["src/auth/middleware.ts", "src/auth/jwt.ts"]
    discovered_by: "locator"
```

**Cross-researcher messaging:**
```yaml
# Example: Analyzer messages pattern-finder
Teammate.write:
  target: "pattern-finder"
  value: "Found decorator pattern at src/auth/middleware.ts:23. Might want to find other uses."
```

**Monitoring loop:**
```
while tasks remain:
  TaskList  # Check status

  # Handle researcher messages (auto-delivered)
  # Researchers create follow-up tasks themselves

  # Check for newly created tasks needing assignment
  for new_task in tasks where status=pending and no owner:
    # New follow-up task - a researcher will claim it
    pass

  # Check completion
  if all tasks complete:
    break
```

## Step 5: Synthesize Findings

Once all tasks complete, gather and synthesize:

```yaml
# Collect findings from task metadata
for task in completed_tasks:
  findings[task.type].append(task.metadata.findings)

# Synthesize into unified report
```

**Synthesis output format:**

```markdown
## Research Report: {Topic}

### Files Found
[From locator tasks]
- `path/to/file.ts` - Description
- `path/to/other.ts` - Description

### Implementation Analysis
[From analyzer tasks]
- **{Component}**: How it works (file:line references)
- **{Data Flow}**: Entry → Processing → Output

### Patterns in Use
[From pattern-finder tasks]
- **{Pattern 1}**: Example at `file.ts:XX`
- **{Pattern 2}**: Example at `other.ts:YY`

### External Best Practices
[From web-researcher tasks]
- **{Practice 1}**: Source, key points
- **{Practice 2}**: Source, key points

### Key Insights
[Your synthesis of the findings]
1. {Insight combining multiple findings}
2. {Another cross-cutting insight}

### Open Questions
[Anything that couldn't be resolved]
```

## Agent Collaboration Patterns

### Locator → Analyzer
Locator finds files, creates analyze tasks with specific file paths.

### Analyzer → Pattern-finder
Analyzer discovers patterns, messages pattern-finder to find similar uses.

### Web-researcher → All
Web-researcher finds best practices, creates tasks to verify codebase follows them.

### Pattern-finder → Analyzer
Pattern-finder finds variations, creates analyze tasks for complex patterns.

## Task Lifecycle

```
pending → in_progress (claimed by researcher) → completed (findings in metadata)
                ↓
         creates follow-up task (pending) → claimed by appropriate researcher
```

## Example: Research "authentication system"

**Initial decomposition:**
```yaml
TaskCreate: { subject: "Locate auth files", type: "locate", query: "authentication auth jwt" }
TaskCreate: { subject: "Find auth middleware patterns", type: "patterns", pattern: "middleware auth" }
TaskCreate: { subject: "Research JWT best practices", type: "web", query: "JWT authentication best practices 2026" }
```

**Spawn researchers (parallel):**
- Locator claims "Locate auth files"
- Pattern-finder claims "Find auth middleware patterns"
- Web-researcher claims "Research JWT best practices"

**Follow-up tasks created by researchers:**
- Locator: "Analyze src/auth/middleware.ts" (type: analyze)
- Locator: "Analyze src/auth/jwt.ts" (type: analyze)
- Pattern-finder: "Analyze decorator usage in middleware" (type: analyze)
- Web-researcher: "Verify token refresh pattern in codebase" (type: locate)

**Cross-messaging:**
- Web-researcher → Pattern-finder: "JWT spec recommends short-lived tokens. Check if we have refresh token pattern."
- Analyzer → Pattern-finder: "Found custom error types at src/auth/errors.ts. Might want to find usage patterns."

**Final synthesis:**
Combine all findings into unified report.

## Configuration

**Team naming:** `research-{topic-slug}`

**Default timeout:** None (complete when all tasks done)

**Max follow-up depth:** 2 levels (prevent infinite task creation)

**Max tasks per researcher:** 5 (prevent runaway)

## Cleanup

After synthesis complete:
```yaml
Teammate:
  operation: cleanup
```

## Integration

**Used by:**
- `tina:brainstorming` - Research before design
- Direct invocation for codebase exploration

**Uses:**
- `tina:locator` - File finding
- `tina:analyzer` - Deep analysis
- `tina:pattern-finder` - Pattern discovery
- `tina:web-researcher` - External research
