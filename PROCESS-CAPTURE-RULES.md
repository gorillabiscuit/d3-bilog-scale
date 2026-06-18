# Process Capture Rules

Add these to AGENTS.md or CLAUDE.md in the project repo.

---

## Process documentation (article source material)

This project will be written up as an article. Capture the process as we go.

### DEVLOG.md

Append a timestamped one-liner to DEVLOG.md whenever:
- A library, scale type, or visual encoding is chosen or rejected
- A dead end is hit (something doesn't work or looks wrong)
- The data reveals something unexpected
- A meaningful design or technical tradeoff is made
- An approach is abandoned in favour of another

Format: `- **[HH:MM]** [What happened and why, one sentence]`

Do not write retrospective summaries. Capture decisions as they happen.

### Screenshot reminders

You cannot take screenshots. But you MUST prompt me to take one at these moments:
- Before fixing something that looks broken (the "before" is more valuable than the "after")
- When a new chart variant first renders
- When two approaches are side by side and the difference is visible
- When a scale change dramatically alters readability

Use this exact format so I can spot it easily:
```
📸 SCREENSHOT: [description of what to capture and why it matters for the article]
```

### Prompt archiving

When I give you a prompt that represents a meaningful design decision (not routine code edits), save it to `devlog/prompts/` as a numbered markdown file with the prompt text and a one-line note on what it was trying to achieve. These show the thinking process in the article.

Format: `devlog/prompts/01-initial-research.md`, `devlog/prompts/02-symlog-pivot.md`, etc.

### What NOT to capture

- Routine setup, installs, config changes
- Linting fixes, formatting, boilerplate
- Anything that doesn't involve a choice
