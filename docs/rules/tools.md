# Tools Configuration

This document provides guidelines for configuring the tools in your project. The tools help maintain code quality and consistency by enforcing coding standards and identifying potential issues.

## Linter Configuration

This project uses oxlint for linting.

### oxlint

Fast linter for TypeScript.

It supports:

- Most of the rules of typescript-eslint, including type-aware rules.
- TypeScript-oriented rules, including many type-aware rules.

But doesn't support:

- Every third-party lint plugin or rule.
- Some of HTML-superset code, which oxlint only checks its `<script>` block.
- Little bit of rules of typescript-eslint.
- Clean rule definition, like a plugin's `somePlugin.configs.recommended`.

#### Instructions

- Make a config on `scripts/linter/` directory about the plugin.
- Write the rules you want to use in the config. Since oxlint doesn't support `.configs.recommended` or something like that, you should write the rules you want to use in the config. Maybe checking the plugin's code to find out which rules are enabled in the recommended config is helpful.
- Modify `scripts/linter/oxlint-typescript.json` to extend the config you made.

## Formatter Configuration

This project uses Prettier for formatting, since it's not super-fast but still acceptable for formatting.
