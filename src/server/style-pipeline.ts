import { transform } from "npm:lightningcss@1.33.0";

export interface CompiledStyle {
  css: string;
  warnings: string[];
}

export interface StyleCompiler {
  readonly id: string;
  compile(source: string, file: string, options?: { minify?: boolean }): CompiledStyle;
}

export class LightningCssCompiler implements StyleCompiler {
  readonly id = "lightningcss";

  compile(source: string, file: string, options: { minify?: boolean } = {}): CompiledStyle {
    const result = transform({
      filename: file,
      code: new TextEncoder().encode(source),
      minify: options.minify ?? false,
      sourceMap: false,
      errorRecovery: false,
    });

    return {
      css: new TextDecoder().decode(result.code),
      warnings: result.warnings.map((warning) => warning.message),
    };
  }
}

export const defaultStyleCompiler: StyleCompiler = new LightningCssCompiler();
