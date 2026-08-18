export type ExpressionReferenceRoot = "event" | "board" | "state" | "output";

export interface ExpressionReference {
  root: ExpressionReferenceRoot;
  path: readonly string[];
  source: string;
}

export type ExpressionReferenceResolver = (reference: ExpressionReference) => unknown;

export interface ExpressionValidationResult {
  ok: boolean;
  error?: string;
}

export const EXPRESSION_SOURCE_LIMIT = 2048;
const MAX_TOKENS = 512;
const MAX_EVAL_DEPTH = 64;
const MAX_CACHE_SIZE = 128;

const cache = new Map<string, ExpressionNode>();

export class ExpressionSyntaxError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} at ${position + 1}`);
    this.name = "ExpressionSyntaxError";
    this.position = position;
  }
}

export function evaluateExpression(source: string, resolve: ExpressionReferenceResolver): unknown {
  const node = compileExpression(source);
  return evaluateNode(node, resolve, 0);
}

export function validateExpression(source: string): ExpressionValidationResult {
  try {
    compileExpression(source);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function clearExpressionCache(): void {
  cache.clear();
}

function compileExpression(source: string): ExpressionNode {
  if (typeof source !== "string") throw new ExpressionSyntaxError("Expression must be a string", 0);
  if (source.length > EXPRESSION_SOURCE_LIMIT) throw new ExpressionSyntaxError(`Expression exceeds ${EXPRESSION_SOURCE_LIMIT} characters`, EXPRESSION_SOURCE_LIMIT);
  const trimmed = source.trim();
  if (!trimmed) throw new ExpressionSyntaxError("Expression is empty", 0);

  const cached = cache.get(source);
  if (cached) return cached;

  const parser = new Parser(tokenize(source));
  const node = parser.parse();
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(source, node);
  return node;
}

type TokenKind = "number" | "string" | "boolean" | "null" | "reference" | "operator" | "lparen" | "rparen" | "eof";

interface Token {
  kind: TokenKind;
  text: string;
  position: number;
  value?: unknown;
}

type ExpressionNode =
  | { type: "literal"; value: unknown }
  | { type: "reference"; reference: ExpressionReference }
  | { type: "unary"; operator: "!" | "+" | "-"; operand: ExpressionNode }
  | { type: "binary"; operator: BinaryOperator; left: ExpressionNode; right: ExpressionNode };

type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "===" | "!==" | "&&" | "||" | "??";

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const push = (token: Token): void => {
    tokens.push(token);
    if (tokens.length > MAX_TOKENS) throw new ExpressionSyntaxError(`Expression exceeds ${MAX_TOKENS} tokens`, token.position);
  };

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === "(") {
      push({ kind: "lparen", text: char, position: index++ });
      continue;
    }
    if (char === ")") {
      push({ kind: "rparen", text: char, position: index++ });
      continue;
    }

    if (char === "\"" || char === "'") {
      const position = index;
      const quote = char;
      index++;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const current = source[index++];
        if (current === quote) {
          closed = true;
          break;
        }
        if (current !== "\\") {
          value += current;
          continue;
        }
        if (index >= source.length) throw new ExpressionSyntaxError("Unterminated string escape", index - 1);
        const escaped = source[index++];
        const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\\": "\\", "\"": "\"", "'": "'" };
        if (escaped === "u") {
          const hex = source.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new ExpressionSyntaxError("Invalid unicode escape", index - 2);
          value += String.fromCharCode(Number.parseInt(hex, 16));
          index += 4;
        } else if (escaped in escapes) {
          value += escapes[escaped];
        } else {
          throw new ExpressionSyntaxError(`Unsupported escape \\${escaped}`, index - 2);
        }
      }
      if (!closed) throw new ExpressionSyntaxError("Unterminated string", position);
      push({ kind: "string", text: source.slice(position, index), position, value });
      continue;
    }

    if (char === "@") {
      const position = index;
      index++;
      const rootStart = index;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index++;
      const rootText = source.slice(rootStart, index);
      if (!isReferenceRoot(rootText)) throw new ExpressionSyntaxError(`Unknown reference root @${rootText || "?"}`, position);
      const path: string[] = [];
      while (source[index] === ".") {
        index++;
        const segmentStart = index;
        while (index < source.length && /[A-Za-z0-9_-]/.test(source[index])) index++;
        if (segmentStart === index) throw new ExpressionSyntaxError("Reference path segment is empty", index);
        path.push(source.slice(segmentStart, index));
      }
      if (rootText === "board" && path.length < 1) throw new ExpressionSyntaxError("@board requires a key", position);
      if ((rootText === "state" || rootText === "output") && path.length < 2) {
        throw new ExpressionSyntaxError(`@${rootText} requires an id and field`, position);
      }
      const text = source.slice(position, index);
      push({ kind: "reference", text, position, value: { root: rootText, path, source: text } satisfies ExpressionReference });
      continue;
    }

    if (isNumberStart(source, index)) {
      const position = index;
      if (source[index] === ".") index++;
      while (index < source.length && /[0-9]/.test(source[index])) index++;
      if (source[index] === ".") {
        index++;
        while (index < source.length && /[0-9]/.test(source[index])) index++;
      }
      if (source[index] === "e" || source[index] === "E") {
        const exponentPosition = index;
        index++;
        if (source[index] === "+" || source[index] === "-") index++;
        const digitsStart = index;
        while (index < source.length && /[0-9]/.test(source[index])) index++;
        if (digitsStart === index) throw new ExpressionSyntaxError("Invalid numeric exponent", exponentPosition);
      }
      const text = source.slice(position, index);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new ExpressionSyntaxError("Invalid number", position);
      push({ kind: "number", text, position, value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const position = index;
      index++;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index++;
      const text = source.slice(position, index);
      if (text === "true" || text === "false") push({ kind: "boolean", text, position, value: text === "true" });
      else if (text === "null") push({ kind: "null", text, position, value: null });
      else throw new ExpressionSyntaxError(`Unknown identifier ${text}`, position);
      continue;
    }

    const operator = matchOperator(source, index);
    if (operator) {
      push({ kind: "operator", text: operator, position: index });
      index += operator.length;
      continue;
    }

    throw new ExpressionSyntaxError(`Unexpected character ${JSON.stringify(char)}`, index);
  }

  tokens.push({ kind: "eof", text: "", position: source.length });
  return tokens;
}

class Parser {
  #index = 0;
  readonly #tokens: Token[];

  constructor(tokens: Token[]) {
    this.#tokens = tokens;
  }

  parse(): ExpressionNode {
    const expression = this.#parseNullish();
    const token = this.#peek();
    if (token.kind !== "eof") throw new ExpressionSyntaxError(`Unexpected token ${token.text}`, token.position);
    return expression;
  }

  #parseNullish(): ExpressionNode {
    let left = this.#parseOr();
    while (this.#matchOperator("??")) left = { type: "binary", operator: "??", left, right: this.#parseOr() };
    return left;
  }

  #parseOr(): ExpressionNode {
    let left = this.#parseAnd();
    while (this.#matchOperator("||")) left = { type: "binary", operator: "||", left, right: this.#parseAnd() };
    return left;
  }

  #parseAnd(): ExpressionNode {
    let left = this.#parseEquality();
    while (this.#matchOperator("&&")) left = { type: "binary", operator: "&&", left, right: this.#parseEquality() };
    return left;
  }

  #parseEquality(): ExpressionNode {
    let left = this.#parseComparison();
    while (true) {
      if (this.#matchOperator("===")) left = { type: "binary", operator: "===", left, right: this.#parseComparison() };
      else if (this.#matchOperator("!==")) left = { type: "binary", operator: "!==", left, right: this.#parseComparison() };
      else return left;
    }
  }

  #parseComparison(): ExpressionNode {
    let left = this.#parseAdditive();
    while (true) {
      const operator = this.#matchOne("<=", ">=", "<", ">");
      if (!operator) return left;
      left = { type: "binary", operator, left, right: this.#parseAdditive() };
    }
  }

  #parseAdditive(): ExpressionNode {
    let left = this.#parseMultiplicative();
    while (true) {
      const operator = this.#matchOne("+", "-");
      if (!operator) return left;
      left = { type: "binary", operator, left, right: this.#parseMultiplicative() };
    }
  }

  #parseMultiplicative(): ExpressionNode {
    let left = this.#parseUnary();
    while (true) {
      const operator = this.#matchOne("*", "/", "%");
      if (!operator) return left;
      left = { type: "binary", operator, left, right: this.#parseUnary() };
    }
  }

  #parseUnary(): ExpressionNode {
    const operator = this.#matchOne("!", "+", "-");
    if (operator) return { type: "unary", operator, operand: this.#parseUnary() };
    return this.#parsePrimary();
  }

  #parsePrimary(): ExpressionNode {
    const token = this.#peek();
    if (token.kind === "number" || token.kind === "string" || token.kind === "boolean" || token.kind === "null") {
      this.#index++;
      return { type: "literal", value: token.value };
    }
    if (token.kind === "reference") {
      this.#index++;
      return { type: "reference", reference: token.value as ExpressionReference };
    }
    if (token.kind === "lparen") {
      this.#index++;
      const expression = this.#parseNullish();
      const close = this.#peek();
      if (close.kind !== "rparen") throw new ExpressionSyntaxError("Expected closing parenthesis", close.position);
      this.#index++;
      return expression;
    }
    throw new ExpressionSyntaxError(token.kind === "eof" ? "Unexpected end of expression" : `Unexpected token ${token.text}`, token.position);
  }

  #matchOperator(operator: BinaryOperator | "!" | "+" | "-"): boolean {
    const token = this.#peek();
    if (token.kind !== "operator" || token.text !== operator) return false;
    this.#index++;
    return true;
  }

  #matchOne<const T extends readonly string[]>(...operators: T): T[number] | null {
    const token = this.#peek();
    if (token.kind !== "operator" || !operators.includes(token.text)) return null;
    this.#index++;
    return token.text as T[number];
  }

  #peek(): Token {
    return this.#tokens[this.#index] ?? this.#tokens[this.#tokens.length - 1];
  }
}

function evaluateNode(node: ExpressionNode, resolve: ExpressionReferenceResolver, depth: number): unknown {
  if (depth > MAX_EVAL_DEPTH) throw new Error(`Expression exceeds maximum depth ${MAX_EVAL_DEPTH}.`);
  if (node.type === "literal") return node.value;
  if (node.type === "reference") return resolve(node.reference);
  if (node.type === "unary") {
    const value = evaluateNode(node.operand, resolve, depth + 1);
    if (node.operator === "!") return !value;
    if (node.operator === "+") return Number(value);
    return -Number(value);
  }

  const left = evaluateNode(node.left, resolve, depth + 1);
  if (node.operator === "&&") return left ? evaluateNode(node.right, resolve, depth + 1) : left;
  if (node.operator === "||") return left ? left : evaluateNode(node.right, resolve, depth + 1);
  if (node.operator === "??") return left === null || left === undefined ? evaluateNode(node.right, resolve, depth + 1) : left;

  const right = evaluateNode(node.right, resolve, depth + 1);
  switch (node.operator) {
    case "+": return typeof left === "string" || typeof right === "string" ? String(left) + String(right) : Number(left) + Number(right);
    case "-": return Number(left) - Number(right);
    case "*": return Number(left) * Number(right);
    case "/": return Number(left) / Number(right);
    case "%": return Number(left) % Number(right);
    case "<": return compare(left, right) < 0;
    case "<=": return compare(left, right) <= 0;
    case ">": return compare(left, right) > 0;
    case ">=": return compare(left, right) >= 0;
    case "===": return left === right;
    case "!==": return left !== right;
  }
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === "string" && typeof right === "string") return left < right ? -1 : left > right ? 1 : 0;
  const a = Number(left);
  const b = Number(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return a < b ? -1 : a > b ? 1 : 0;
}

function matchOperator(source: string, index: number): string | null {
  for (const operator of ["===", "!==", "&&", "||", "??", "<=", ">=", "+", "-", "*", "/", "%", "<", ">", "!"]) {
    if (source.startsWith(operator, index)) return operator;
  }
  return null;
}

function isReferenceRoot(value: string): value is ExpressionReferenceRoot {
  return value === "event" || value === "board" || value === "state" || value === "output";
}

function isNumberStart(source: string, index: number): boolean {
  return /[0-9]/.test(source[index]) || (source[index] === "." && /[0-9]/.test(source[index + 1] ?? ""));
}
