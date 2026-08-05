import MarkdownPreview from '@uiw/react-markdown-preview';

const MOCK_PR_MARKDOWN = `
# 🚀 PR Overview: Database Authentication Refactor

This pull request refactors the database authentication logic. It aims to improve security by migrating towards parameterized queries, but currently introduces a flaw that is flagged in the **AI Review & Suggestions** tab.

## 📝 What's Changed

- **Refactored \`authenticate()\`**: The authentication function was completely rewritten to support real database verification.
- **Added Password Support**: The function now accepts a \`password\` argument.
- **Removed Hardcoded Mocks**: The previous implementation that always returned \`true\` was removed.

## 📂 Files Touched

### \`src/database.js\` (Modified)
- **+12 additions, -3 deletions**
- *Status*: Needs Review (Contains Architectural Violation).

## 🛑 Blockers
- **SQL Injection Risk**: The new implementation concatenates strings directly into the SQL query, violating the project manifest.

---
*Generated automatically by Local AI.*
`;

export function PRSummaryTab() {
  return (
    <div className="h-full bg-background overflow-y-auto w-full">
      <div className="p-8 max-w-3xl mx-auto w-full">
        <MarkdownPreview
          source={MOCK_PR_MARKDOWN}
          style={{ backgroundColor: 'transparent' }}
          className="text-sm! md:text-base! w-full"
        />
      </div>
    </div>
  );
}
