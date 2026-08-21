import { Project, SyntaxKind, Node } from 'ts-morph';
const project = new Project({
  tsConfigFilePath: 'tsconfig.app.json',
});
const sourceFiles = project.getSourceFiles().filter((s) => s.getFilePath().endsWith('.tsx'));
console.log(`Found ${sourceFiles.length} TSX files to process.`);
let modifiedFilesCount = 0;
for (const sourceFile of sourceFiles) {
  let hasModifications = false;
  // We want to process from bottom to top so that replacing text doesn't affect offsets of nodes we haven't processed yet.
  const jsxExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression).reverse();
  for (const jsxExpr of jsxExpressions) {
    // Only target JSX expressions that are children of JSX elements/fragments, not attributes.
    const parent = jsxExpr.getParent();
    if (!parent || (!Node.isJsxElement(parent) && !Node.isJsxFragment(parent))) {
      continue;
    }
    const expression = jsxExpr.getExpression();
    if (!expression) continue;
    if (
      Node.isBinaryExpression(expression) &&
      expression.getOperatorToken().getKind() === SyntaxKind.AmpersandAmpersandToken
    ) {
      const left = expression.getLeft().getText();
      const right = expression.getRight().getText();
      const newText = `<Visible visible={${left}}>\n${right}\n</Visible>`;
      jsxExpr.replaceWithText(newText);
      hasModifications = true;
    } else if (Node.isConditionalExpression(expression)) {
      const condition = expression.getCondition().getText();
      const whenTrue = expression.getWhenTrue().getText();
      const whenFalse = expression.getWhenFalse().getText();
      const newText = `<Visible visible={${condition}} fallback={${whenFalse}}>\n${whenTrue}\n</Visible>`;
      jsxExpr.replaceWithText(newText);
      hasModifications = true;
    }
  }
  if (hasModifications) {
    // Check if Visible is already imported
    const importDeclarations = sourceFile.getImportDeclarations();
    const hasVisibleImport = importDeclarations.some(
      (imp) =>
        imp.getModuleSpecifierValue() === '@/components/common/Visible' ||
        imp.getModuleSpecifierValue().endsWith('/Visible'),
    );
    if (!hasVisibleImport) {
      sourceFile.addImportDeclaration({
        defaultImport: 'Visible',
        moduleSpecifier: '@/components/common/Visible',
      });
    }
    modifiedFilesCount++;
    sourceFile.formatText();
  }
}
project.saveSync();
console.log(`Successfully refactored ${modifiedFilesCount} files.`);
