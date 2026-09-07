/**
 * DEMO ONLY — not the real extension code path.
 *
 * The actual extension (../src/parser/extractor.ts) uses postcss's real CSS/SCSS
 * AST parser, which correctly handles nesting, comments, strings, and multi-line
 * values. This script re-implements a much simpler line-based version of the
 * same classification logic using zero dependencies, purely so the extraction
 * rules can be sanity-checked and run right now, without npm registry access.
 *
 * Do not build on top of this file — port any rule changes back into
 * src/parser/valueClassifier.ts and src/parser/extractor.ts instead.
 */

const fs = require('fs');
const path = require('path');

const COLOR_REGEX = /#(?:[0-9a-fA-F]{3,8})\b|(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\)/g;
const LENGTH_REGEX = /-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ch|ex|pt|pc|in|cm|mm)/g;
const TIME_REGEX = /-?\d*\.?\d+(?:ms|s)\b/g;
const EASING_REGEX = /cubic-bezier\([^)]*\)|\bease-in-out\b|\bease-in\b|\bease-out\b|\bease\b|\blinear\b/g;
const MEDIA_BREAKPOINT_REGEX = /(min-width|max-width|min-height|max-height)\s*:\s*(-?\d*\.?\d+(?:px|em|rem))/g;
const INTEGER_REGEX = /^-?\d+$/;

const SPACING_PROPS = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
]);
const RADIUS_PROPS = new Set([
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);
const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow']);
const TRANSITION_PROPS = new Set(['transition', 'transition-duration', 'animation', 'animation-duration']);

function classifyProperty(prop) {
  if (SPACING_PROPS.has(prop)) return 'spacing';
  if (prop === 'font-family' || prop === 'font') return 'font-family';
  if (prop === 'font-size') return 'font-size';
  if (prop === 'font-weight') return 'font-weight';
  if (prop === 'line-height') return 'line-height';
  if (prop === 'letter-spacing') return 'letter-spacing';
  if (RADIUS_PROPS.has(prop)) return 'radius';
  if (SHADOW_PROPS.has(prop)) return 'shadow';
  if (prop === 'z-index') return 'z-index';
  if (TRANSITION_PROPS.has(prop)) return 'transition';
  return 'unknown';
}

function pushMatches(occurrences, regex, text, category, ctx) {
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    occurrences.push({ ...ctx, rawValue: m[0], category });
  }
}

function extractFromFile(relativePath, contents) {
  const occurrences = [];
  const lines = contents.split('\n');
  const selectorStack = [];

  lines.forEach((lineText, idx) => {
    const line = idx + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

    // very rough brace tracking (demo-grade — real code uses postcss's AST instead)
    if (trimmed.endsWith('{')) {
      const opened = trimmed.replace('{', '').trim();
      selectorStack.push(opened);

      // Extract breakpoints at the moment the @media rule itself is opened,
      // not from whatever selector happens to be innermost later — nested
      // rules inside @media would otherwise shadow it.
      if (opened.startsWith('@media')) {
        MEDIA_BREAKPOINT_REGEX.lastIndex = 0;
        let m;
        while ((m = MEDIA_BREAKPOINT_REGEX.exec(opened)) !== null) {
          occurrences.push({
            file: relativePath, line, selector: opened, property: '@media',
            rawValue: m[2], category: 'breakpoint',
          });
        }
      }
      return;
    }
    if (trimmed === '}') {
      selectorStack.pop();
      return;
    }

    const currentSelector = selectorStack[selectorStack.length - 1] || '(root)';

    // declaration line: "prop: value;"
    const declMatch = trimmed.match(/^([a-zA-Z-]+)\s*:\s*(.+?);?\s*(\/\*.*\*\/)?$/);
    if (!declMatch) return;
    const prop = declMatch[1].trim().toLowerCase();
    const value = declMatch[2].trim();
    const ctx = { file: relativePath, line, selector: currentSelector, property: prop };

    pushMatches(occurrences, COLOR_REGEX, value, 'color', ctx);

    const category = classifyProperty(prop);
    switch (category) {
      case 'spacing':
      case 'radius':
      case 'font-size':
      case 'letter-spacing':
      case 'shadow':
        pushMatches(occurrences, LENGTH_REGEX, value, category, ctx);
        break;
      case 'line-height':
        if (/^-?\d*\.?\d+$/.test(value)) {
          occurrences.push({ ...ctx, rawValue: value, category: 'line-height' });
        } else {
          pushMatches(occurrences, LENGTH_REGEX, value, 'line-height', ctx);
        }
        break;
      case 'font-family':
        occurrences.push({ ...ctx, rawValue: value, category: 'font-family' });
        break;
      case 'font-weight':
        if (INTEGER_REGEX.test(value) || /^(normal|bold|lighter|bolder)$/i.test(value)) {
          occurrences.push({ ...ctx, rawValue: value, category: 'font-weight' });
        }
        break;
      case 'z-index':
        if (INTEGER_REGEX.test(value)) occurrences.push({ ...ctx, rawValue: value, category: 'z-index' });
        break;
      case 'transition':
        pushMatches(occurrences, TIME_REGEX, value, 'transition', ctx);
        pushMatches(occurrences, EASING_REGEX, value, 'transition', ctx);
        break;
      default:
        break;
    }
  });

  return occurrences;
}

// --- run against the fixture ---
const fixturePath = path.join(__dirname, 'fixtures', 'sample.css');
const contents = fs.readFileSync(fixturePath, 'utf8');
const occurrences = extractFromFile('demo/fixtures/sample.css', contents);

const summary = {};
for (const o of occurrences) {
  summary[o.category] = summary[o.category] || { totalOccurrences: 0, values: new Set() };
  summary[o.category].totalOccurrences += 1;
  summary[o.category].values.add(o.rawValue);
}
const summaryOut = Object.fromEntries(
  Object.entries(summary).map(([k, v]) => [k, { totalOccurrences: v.totalOccurrences, uniqueValues: v.values.size }])
);

console.log('=== Occurrences ===');
console.log(JSON.stringify(occurrences, null, 2));
console.log('\n=== Summary by category ===');
console.log(JSON.stringify(summaryOut, null, 2));
