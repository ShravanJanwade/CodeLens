import ts from 'typescript';

export interface SourceSymbol {
  name: string;
  kind: string;
  line: number;
  endLine: number;
}
export function parseSource(content: string, filePath: string) {
  const backed = /\.[cm]?[jt]sx?$/.test(filePath);
  const symbols: SourceSymbol[] = [];
  const imports = new Set<string>();
  if (!backed) {
    if (!filePath.endsWith('.py'))
      return {
        symbols,
        imports: [],
        method: 'text only',
        limitations:
          'Source is available for inspection; symbol and dependency parsing is not supported for this file type.',
      };
    for (const match of content.matchAll(/^\s*(?:def|class)\s+(\w+)/gm)) {
      const line = content.slice(0, match.index).split('\n').length;
      symbols.push({ name: match[1], kind: 'heuristic declaration', line, endLine: line });
    }
    return {
      symbols,
      imports: [],
      method: 'heuristic',
      limitations: 'Only Python-style declarations; no complete dependency coverage.',
    };
  }
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.add(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.add(node.arguments[0].text);
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isMethodDeclaration(node)
    ) {
      if (node.name && ts.isIdentifier(node.name))
        symbols.push({
          name: node.name.text,
          kind: ts.SyntaxKind[node.kind],
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          endLine: source.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return {
    symbols,
    imports: [...imports],
    method: 'TypeScript compiler AST',
    limitations: 'Syntactic imports only; aliases, computed imports and call graphs are not resolved.',
  };
}
