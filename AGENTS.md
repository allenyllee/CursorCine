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
