const KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "get",
  "if", "implements", "import", "in", "instanceof", "interface", "let", "new", "null", "of", "private", "protected",
  "public", "readonly", "return", "satisfies", "set", "static", "super", "switch", "this", "throw", "true", "try",
  "type", "typeof", "undefined", "var", "while", "with", "yield",
]);

const TYPES = new Set([
  "any", "boolean", "never", "number", "object", "string", "symbol", "unknown", "void", "Record", "Array", "Map",
  "Set", "Promise", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLSelectElement", "Event", "MouseEvent",
]);

const BUILTINS = new Set([
  "Array", "Boolean", "Date", "Error", "JSON", "Math", "Number", "Object", "Promise", "String", "console", "document",
  "window", "structuredClone", "defineObject",
]);

export class CodeEditor {
  readonly element: HTMLElement;
  readonly #textarea: HTMLTextAreaElement;
  readonly #highlight: HTMLElement;
  readonly #lines: HTMLElement;
  readonly #cursor: HTMLElement;
  #onSave: (() => void) | null = null;
  #onChange: ((value: string) => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "code-editor";

    this.#lines = document.createElement("pre");
    this.#lines.className = "code-editor__lines";

    const viewport = document.createElement("div");
    viewport.className = "code-editor__viewport";

    this.#highlight = document.createElement("pre");
    this.#highlight.className = "code-editor__highlight";
    this.#highlight.setAttribute("aria-hidden", "true");

    this.#textarea = document.createElement("textarea");
    this.#textarea.className = "code-editor__input";
    this.#textarea.spellcheck = false;
    this.#textarea.wrap = "off";
    this.#textarea.autocapitalize = "off";
    this.#textarea.autocomplete = "off";
    this.#textarea.setAttribute("aria-label", "TypeScript code editor");

    this.#cursor = document.createElement("div");
    this.#cursor.className = "code-editor__cursor-position";
    this.#cursor.textContent = "Ln 1, Col 1";

    viewport.append(this.#highlight, this.#textarea);
    this.element.append(this.#lines, viewport, this.#cursor);

    this.#textarea.addEventListener("input", () => {
      this.#sync();
      this.#onChange?.(this.#textarea.value);
    });
    this.#textarea.addEventListener("scroll", () => this.#syncScroll());
    this.#textarea.addEventListener("keydown", (event) => this.#handleKeyDown(event));
    this.#textarea.addEventListener("keyup", () => this.#syncCursor());
    this.#textarea.addEventListener("click", () => this.#syncCursor());
    this.#textarea.addEventListener("select", () => this.#syncCursor());
    this.#sync();
  }

  setValue(value: string): void {
    this.#textarea.value = value;
    this.#textarea.scrollTop = 0;
    this.#textarea.scrollLeft = 0;
    this.#sync();
  }

  getValue(): string {
    return this.#textarea.value;
  }

  focus(): void {
    this.#textarea.focus();
  }

  onSave(callback: () => void): void {
    this.#onSave = callback;
  }

  onChange(callback: (value: string) => void): void {
    this.#onChange = callback;
  }

  setReadOnly(readOnly: boolean): void {
    this.#textarea.readOnly = readOnly;
    this.element.classList.toggle("is-readonly", readOnly);
  }

  #sync(): void {
    const lineCount = Math.max(1, this.#textarea.value.split("\n").length);
    this.#lines.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
    this.#highlight.innerHTML = highlightTypeScript(this.#textarea.value) + "\n";
    this.#syncScroll();
    this.#syncCursor();
  }

  #syncScroll(): void {
    this.#highlight.style.transform = `translate(${-this.#textarea.scrollLeft}px, ${-this.#textarea.scrollTop}px)`;
    this.#lines.style.transform = `translateY(${-this.#textarea.scrollTop}px)`;
  }

  #syncCursor(): void {
    const before = this.#textarea.value.slice(0, this.#textarea.selectionStart);
    const lines = before.split("\n");
    this.#cursor.textContent = `Ln ${lines.length}, Col ${(lines.at(-1)?.length ?? 0) + 1}`;
  }

  #handleKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      this.#onSave?.();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      this.#replaceSelection("  ");
      return;
    }

    if (event.key === "Enter") {
      const start = this.#textarea.selectionStart;
      const before = this.#textarea.value.slice(0, start);
      const currentLine = before.slice(before.lastIndexOf("\n") + 1);
      const indent = currentLine.match(/^\s*/)?.[0] ?? "";
      const extra = /[{[(]\s*$/.test(currentLine) ? "  " : "";
      event.preventDefault();
      this.#replaceSelection(`\n${indent}${extra}`);
    }
  }

  #replaceSelection(text: string): void {
    const start = this.#textarea.selectionStart;
    const end = this.#textarea.selectionEnd;
    const value = this.#textarea.value;
    this.#textarea.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    this.#textarea.selectionStart = this.#textarea.selectionEnd = start + text.length;
    this.#sync();
    this.#onChange?.(this.#textarea.value);
  }
}

function highlightTypeScript(source: string): string {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      output += token("comment", source.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === "/" && next === "*") {
      const found = source.indexOf("*/", index + 2);
      const stop = found === -1 ? source.length : found + 2;
      output += token("comment", source.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      let stop = index + 1;
      while (stop < source.length) {
        if (source[stop] === "\\") {
          stop += 2;
          continue;
        }
        if (source[stop] === quote) {
          stop++;
          break;
        }
        stop++;
      }
      output += token(quote === "`" ? "template" : "string", source.slice(index, stop));
      index = stop;
      continue;
    }

    if (/\d/.test(char) && (index === 0 || !/[\w$]/.test(source[index - 1]))) {
      const match = source.slice(index).match(/^(?:0[xob][\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
      if (match) {
        output += token("number", match[0]);
        index += match[0].length;
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(char)) {
      const match = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
      if (match) {
        const word = match[0];
        const rest = source.slice(index + word.length);
        const nextMeaningful = rest.match(/^\s*(.)/)?.[1];
        let kind = "identifier";
        if (KEYWORDS.has(word)) kind = "keyword";
        else if (TYPES.has(word)) kind = "type";
        else if (BUILTINS.has(word)) kind = "builtin";
        else if (nextMeaningful === "(") kind = "function";
        else if (/^[A-Z]/.test(word)) kind = "type";
        output += token(kind, word);
        index += word.length;
        continue;
      }
    }

    if (/[{}()[\],.;:]/.test(char)) {
      output += token("punctuation", char);
      index++;
      continue;
    }

    if (/[+\-*\/%=&|!<>?~^]/.test(char)) {
      const match = source.slice(index).match(/^(?:===|!==|=>|==|!=|<=|>=|\+\+|--|&&|\|\||\?\?|\?\.|\+=|-=|\*=|\/=|\*\*|<<|>>|>>>|[+\-*\/%=&|!<>?~^])/);
      const operator = match?.[0] ?? char;
      output += token("operator", operator);
      index += operator.length;
      continue;
    }

    output += escapeHtml(char);
    index++;
  }

  return output;
}

function token(kind: string, value: string): string {
  return `<span class="tok-${kind}">${escapeHtml(value)}</span>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char] ?? char));
}
