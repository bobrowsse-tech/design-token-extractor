import * as postcss from 'postcss';
import * as scss from 'postcss-scss';
import * as less from 'postcss-less';
import * as path from 'path';

const SCRIPT_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const MARKUP_EXTS = new Set(['.html', '.htm', '.vue']);

export function stylesheetExt(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function isScriptFile(filePath: string): boolean {
  return SCRIPT_EXTS.has(stylesheetExt(filePath));
}

export function isMarkupFile(filePath: string): boolean {
  return MARKUP_EXTS.has(stylesheetExt(filePath));
}

export function isStylesheetFile(filePath: string): boolean {
  return ['.css', '.scss', '.sass', '.less'].includes(stylesheetExt(filePath));
}

export function lineColToOffset(text: string, line: number, column: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line) {
    const newline = text.indexOf('\n', offset);
    if (newline === -1) return text.length;
    offset = newline + 1;
    currentLine += 1;
  }
  return offset + Math.max(0, column - 1);
}

export function parseStylesheet(filePath: string, contents: string): postcss.Root {
  const ext = stylesheetExt(filePath);
  if (ext === '.scss' || ext === '.sass') return scss.parse(contents, { from: filePath });
  if (ext === '.less') return less.parse(contents, { from: filePath });
  return postcss.parse(contents, { from: filePath });
}

export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNl = i;
    }
  }
  return { line, column: offset - lastNl };
}
