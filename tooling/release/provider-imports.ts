import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isIdentifier,
  isImportDeclaration,
  isImportTypeNode,
  isLiteralTypeNode,
  isPropertyAccessExpression,
  isStringLiteralLike,
  type Node,
  ScriptTarget,
  SyntaxKind,
} from "typescript-compiler-api";

const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/;
const PROVIDER_MODULE =
  /(?:^|\/)(?:@clerk\/|@better-auth\/|better-auth(?:\/|$))/;
const EXCLUDED_DIRECTORIES = new Set([
  "generated",
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  ".git",
  "coverage",
]);

export function providerImports(file: string, source: string): string[] {
  // Most source cannot name a provider. Escapes still require parsing because
  // module specifiers can encode characters or contain line continuations.
  if (
    !(
      source.includes("@clerk/") ||
      source.includes("better-auth") ||
      source.includes("\\")
    )
  ) {
    return [];
  }
  const parsed = createSourceFile(file, source, ScriptTarget.Latest, true);
  const violations: string[] = [];
  function visit(node: Node) {
    if (isStringLiteralLike(node) && PROVIDER_MODULE.test(node.text)) {
      const { parent } = node;
      const isModule =
        (isImportDeclaration(parent) || isExportDeclaration(parent)) &&
        parent.moduleSpecifier === node;
      const isTypeImport =
        isLiteralTypeNode(parent) && isImportTypeNode(parent.parent);
      const isRequireImport = isExternalModuleReference(parent);
      const isModuleCall =
        isCallExpression(parent) &&
        parent.arguments[0] === node &&
        (parent.expression.kind === SyntaxKind.ImportKeyword ||
          (isIdentifier(parent.expression) &&
            parent.expression.text === "require") ||
          (isPropertyAccessExpression(parent.expression) &&
            [
              "mock",
              "doMock",
              "importActual",
              "importMock",
              "resolve",
            ].includes(parent.expression.name.text)));
      if (isModule || isTypeImport || isRequireImport || isModuleCall) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`${file}:${line + 1}: ${node.text}`);
      }
    }
    forEachChild(node, visit);
  }
  visit(parsed);
  return violations;
}

export function repositoryProviderImports(root: string): string[] {
  const violations: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(resolve(root, directory), {
      withFileTypes: true,
    })) {
      const file = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (
          !EXCLUDED_DIRECTORIES.has(entry.name) &&
          (!entry.name.startsWith(".") || entry.name === ".github") &&
          file !== "packages/auth"
        ) {
          visit(file);
        }
      } else if (entry.isFile() && SOURCE_EXTENSION.test(file)) {
        violations.push(
          ...providerImports(file, readFileSync(resolve(root, file), "utf8"))
        );
      }
    }
  }
  visit("");
  return violations;
}
