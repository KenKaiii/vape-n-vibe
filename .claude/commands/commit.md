---
name: commit
description: Run checks, commit with AI message, and push
---

1. Run quality checks:

   ```bash
   npm run lint
   npm run format:check
   ```

   Fix ALL errors before continuing.

2. Review changes: `git status` and `git diff`

3. Generate commit message:
   - Start with verb (Add/Update/Fix/Remove/Refactor)
   - Be specific and concise
   - One line preferred

4. Commit and push:
   ```bash
   git add -A
   git commit -m "your generated message"
   git push
   ```
