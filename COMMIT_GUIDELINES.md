# Git Commit Message Guidelines

This project follows a clear and consistent commit message style to ensure a readable and maintainable history.

---

## 🧩 Format

Each commit message should follow this structure:

```
type(scope): Short description

Longer explanation (optional). Wrap at 72 characters per line.

If applicable, include a footer with "BREAKING CHANGE:" or issue references.
```

---

## ✍️ Rules

### 1. Limit the subject line to 50 characters
- Be concise and descriptive.
- Use the imperative mood (e.g., “Fix bug” not “Fixed” or “Fixes”).

### 2. Capitalize the subject line
- The first letter should be uppercase.
- Do not end the subject line with a period.

### 3. Use the body to explain what and why vs. how
- The body is optional but encouraged for non-trivial changes.
- Include motivation, context, and reasoning behind the change.

### 4. Wrap the body at 72 characters
- Improves readability in CLI and Git tools.

### 5. Use footer for metadata
- Reference issues (e.g., `Closes #123`, `Refs #456`).
- Include breaking changes:  
  ```
  BREAKING CHANGE: explanation
  ```
