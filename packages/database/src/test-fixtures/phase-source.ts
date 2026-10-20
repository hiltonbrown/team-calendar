import {
  createScanner,
  LanguageVariant,
  type Scanner,
  SyntaxKind,
} from "typescript/unstable/ast";

interface Token {
  kind: SyntaxKind;
  text: string;
  value: string;
}
interface Depth {
  angles: number;
  brackets: number;
  parentheses: number;
  typeBraces: number;
}
const CLOSING_ANGLES = /^>{1,3}$/;
const TYPE_PREFIXES = new Set([
  SyntaxKind.ColonToken,
  SyntaxKind.BarToken,
  SyntaxKind.AmpersandToken,
]);
const REGEX_PREFIXES = new Set([
  SyntaxKind.EqualsToken,
  SyntaxKind.OpenParenToken,
  SyntaxKind.ReturnKeyword,
  SyntaxKind.CommaToken,
  SyntaxKind.ColonToken,
  SyntaxKind.ExclamationToken,
  SyntaxKind.EqualsGreaterThanToken,
  SyntaxKind.OpenBracketToken,
  SyntaxKind.QuestionToken,
]);

const templateToken = (
  scanner: Scanner,
  kind: SyntaxKind,
  braces: number[]
): SyntaxKind => {
  if (kind === SyntaxKind.TemplateHead) {
    braces.push(0);
  }
  if (braces.length === 0) {
    return kind;
  }
  const index = braces.length - 1;
  if (kind === SyntaxKind.OpenBraceToken) {
    braces[index] += 1;
  }
  if (kind !== SyntaxKind.CloseBraceToken) {
    return kind;
  }
  if (braces[index] > 0) {
    braces[index] -= 1;
    return kind;
  }
  const rescanned = scanner.reScanTemplateToken(false);
  if (rescanned === SyntaxKind.TemplateTail) {
    braces.pop();
  }
  return rescanned;
};

const tokensFor = (source: string): Token[] => {
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  const tokens: Token[] = [];
  const templates: number[] = [];
  for (
    let kind = scanner.scan();
    kind !== SyntaxKind.EndOfFile;
    kind = scanner.scan()
  ) {
    if (
      kind === SyntaxKind.SlashToken &&
      REGEX_PREFIXES.has(tokens.at(-1)?.kind ?? SyntaxKind.Unknown)
    ) {
      kind = scanner.reScanSlashToken();
    }
    kind = templateToken(scanner, kind, templates);
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
    });
  }
  return tokens;
};

const afterParameters = (
  tokens: Token[],
  start: number
): number | undefined => {
  if (tokens[start]?.kind !== SyntaxKind.OpenParenToken) {
    return;
  }
  let depth = 1;
  for (let index = start + 1; index < tokens.length; index += 1) {
    if (tokens[index].kind === SyntaxKind.OpenParenToken) {
      depth += 1;
    }
    if (tokens[index].kind === SyntaxKind.CloseParenToken) {
      depth -= 1;
    }
    if (depth === 0) {
      return index + 1;
    }
  }
};

const advanceTypeDepth = (token: Token, depth: Depth): void => {
  if (token.text === "<") {
    depth.angles += 1;
  }
  if (CLOSING_ANGLES.test(token.text)) {
    depth.angles = Math.max(0, depth.angles - token.text.length);
  }
  switch (token.kind) {
    case SyntaxKind.OpenParenToken:
      depth.parentheses += 1;
      break;
    case SyntaxKind.CloseParenToken:
      depth.parentheses -= 1;
      break;
    case SyntaxKind.OpenBracketToken:
      depth.brackets += 1;
      break;
    case SyntaxKind.CloseBracketToken:
      depth.brackets -= 1;
      break;
    case SyntaxKind.OpenBraceToken:
      depth.typeBraces += 1;
      break;
    case SyntaxKind.CloseBraceToken:
      depth.typeBraces -= 1;
      break;
    default:
      break;
  }
};
const bodyStart = (tokens: Token[], start: number): number | undefined => {
  const depth: Depth = {
    angles: 0,
    brackets: 0,
    parentheses: 0,
    typeBraces: 0,
  };
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nested = Object.values(depth).some((value) => value > 0);
    if (token.kind === SyntaxKind.SemicolonToken && !nested) {
      return;
    }
    if (
      token.kind === SyntaxKind.OpenBraceToken &&
      !nested &&
      !TYPE_PREFIXES.has(tokens[index - 1]?.kind)
    ) {
      return index;
    }
    advanceTypeDepth(token, depth);
  }
};

const parameterStart = (
  tokens: Token[],
  start: number,
  name: string
): number | undefined => {
  let cursor = start + 1;
  if (tokens[cursor]?.kind === SyntaxKind.AsyncKeyword) {
    cursor += 1;
  }
  const declaration = tokens[cursor]?.kind;
  if (
    !(
      declaration === SyntaxKind.FunctionKeyword ||
      declaration === SyntaxKind.ConstKeyword
    ) ||
    tokens[cursor + 1]?.text !== name
  ) {
    return;
  }
  cursor += 2;
  if (declaration === SyntaxKind.ConstKeyword) {
    while (
      cursor < tokens.length &&
      tokens[cursor].kind !== SyntaxKind.EqualsToken &&
      tokens[cursor].kind !== SyntaxKind.SemicolonToken
    ) {
      cursor += 1;
    }
    if (tokens[cursor]?.kind !== SyntaxKind.EqualsToken) {
      return;
    }
    cursor += 1;
    if (
      tokens[cursor]?.kind === SyntaxKind.AsyncKeyword ||
      tokens[cursor]?.kind === SyntaxKind.FunctionKeyword
    ) {
      cursor += 1;
    }
  }
  return cursor;
};
const guardViolation = (
  tokens: Token[],
  body: number,
  name: string
): string | null => {
  const first = tokens.slice(body + 1, body + 6);
  return first[0]?.kind === SyntaxKind.Identifier &&
    first[0].text === "assertNoTenantTransaction" &&
    first[1]?.kind === SyntaxKind.OpenParenToken &&
    first[2]?.kind === SyntaxKind.StringLiteral &&
    first[2].value === name &&
    first[3]?.kind === SyntaxKind.CloseParenToken &&
    first[4]?.kind === SyntaxKind.SemicolonToken
    ? null
    : "phase guard is not the first statement";
};

// Scan module-level declarations and their first statement without confusing
// comments, string templates or nested return types with the function body.
export const phaseExportViolation = (
  source: string,
  name: string
): string | null => {
  const tokens = tokensFor(source);
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].kind === SyntaxKind.OpenBraceToken) {
      depth += 1;
    }
    if (tokens[index].kind === SyntaxKind.CloseBraceToken) {
      depth -= 1;
    }
    if (depth !== 0 || tokens[index].kind !== SyntaxKind.ExportKeyword) {
      continue;
    }
    const start = parameterStart(tokens, index, name);
    if (start === undefined) {
      continue;
    }
    const end = afterParameters(tokens, start);
    if (end === undefined) {
      continue;
    }
    const body = bodyStart(tokens, end);
    if (body === undefined) {
      continue;
    }
    if (
      tokens
        .slice(start, end)
        .some(
          (token) =>
            token.kind === SyntaxKind.Identifier && token.text === "TenantDb"
        )
    ) {
      return "phased function accepts TenantDb";
    }
    return guardViolation(tokens, body, name);
  }
  return "missing exported function implementation";
};
