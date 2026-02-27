## Git Commit Style

- Follow the `Conventional Commits` format strictly.
- Use this structure:

  `<gitmoji> <type>[optional scope]: <description>`

  `<detailed body>`

- Type and scope:
  - Choose a commit type (for example: `feat`, `fix`).
  - Add an optional scope when it helps identify the affected module or feature.
- Gitmoji:
  - Include the gitmoji that best represents the change.
- Description:
  - Keep the header description concise and informative.
  - Use backticks when referencing code or specific terms.
- Body:
  - Use `*` bullets for clarity.
  - Clearly describe motivation, context, or technical details when applicable.
- Language:
  - Use English only.
- Quality:
  - Commit messages must be clear, informative, and professional to support readability and project tracking.
  - When shipping a new version, update `CHANGELOG.md` in the same change set.
  - The new version entry in `CHANGELOG.md` must include all user-facing changes introduced by commits since the previous release tag.
  - For each new release entry, explicitly review the full commit range from the previous release tag to `HEAD` and ensure no user-facing commit in that range is omitted from `CHANGELOG.md`.
  - When shipping a new version, review `README.md` and update it in the same change set when behavior, features, options, or workflows have changed.
  - When running `git commit -m` in shell commands, do not use unescaped backticks in message arguments; prefer single-quoted message strings or escaped backticks to prevent shell command substitution.

## Post-change Testing Policy

- After implementing changes, always run tests based on the impacted scope before reporting completion.
- Choose the smallest sufficient test set first, then expand when risk is higher:
  - `npm run test:unit` for isolated logic changes.
  - `npm run test:integration` for IPC/preload/controller changes.
  - `npm run test:e2e:windows` and/or `npm run test:e2e:linux` for workflow/UI/runtime changes.
  - `npm run test:coverage` when coverage-related code or test architecture changes.
  - `npm run test:native:coverage:windows:full` for native capture, native coverage, or Windows pipeline changes.
- If any test fails, perform root-cause triage before deciding the fix:
  - Test case issue.
  - Intended spec/behavior change requiring test updates.
  - Regression introduced by code changes.
- If the failure is caused by the implementation change, continue iterating on code fixes and rerun relevant tests until they pass.
- Do not stop at a failing state when the regression is fixable within the current task.
