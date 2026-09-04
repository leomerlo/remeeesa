import eslintConfigPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // dist: build output. .claude/, .agents/, .codex/: vendored skill scripts
  // (impeccable, design-tokens, animate, apple-design) from ai_workflow_template
  // — not app code, not this project's lint/style responsibility.
  { ignores: ['dist', '.claude/**', '.agents/**', '.codex/**'] },
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  eslintConfigPrettier,
)
