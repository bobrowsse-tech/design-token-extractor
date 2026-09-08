import { TokenCategory } from '../types';

/**
 * Property -> category map. This is the FAST PATH: it tells us what a
 * declaration is primarily "about". It does not preclude colors from also
 * being found inside e.g. `border` or `box-shadow` shorthand — those are
 * still caught separately by COLOR_REGEX in extractor.ts.
 */
const SPACING_PROPS = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap',
  'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width',
  'border-left-width', 'outline-width', 'flex-basis',
]);

const FONT_FAMILY_PROPS = new Set(['font-family', 'font']);
const FONT_SIZE_PROPS = new Set(['font-size']);
const FONT_WEIGHT_PROPS = new Set(['font-weight']);
const LINE_HEIGHT_PROPS = new Set(['line-height']);
const LETTER_SPACING_PROPS = new Set(['letter-spacing']);

const RADIUS_PROPS = new Set([
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);

const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow']);
const ZINDEX_PROPS = new Set(['z-index']);
const TRANSITION_PROPS = new Set([
  'transition', 'transition-duration', 'transition-delay', 'transition-timing-function',
  'animation', 'animation-duration', 'animation-timing-function',
]);
const OPACITY_PROPS = new Set(['opacity', 'fill-opacity', 'stroke-opacity']);
const BORDER_SHORTHAND_PROPS = new Set([
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
]);

export function classifyProperty(propRaw: string): TokenCategory | 'unknown' {
  const prop = propRaw.trim().toLowerCase();
  if (SPACING_PROPS.has(prop)) return 'spacing';
  if (FONT_FAMILY_PROPS.has(prop)) return 'font-family';
  if (FONT_SIZE_PROPS.has(prop)) return 'font-size';
  if (FONT_WEIGHT_PROPS.has(prop)) return 'font-weight';
  if (LINE_HEIGHT_PROPS.has(prop)) return 'line-height';
  if (LETTER_SPACING_PROPS.has(prop)) return 'letter-spacing';
  if (RADIUS_PROPS.has(prop)) return 'radius';
  if (SHADOW_PROPS.has(prop)) return 'shadow';
  if (ZINDEX_PROPS.has(prop)) return 'z-index';
  if (TRANSITION_PROPS.has(prop)) return 'transition';
  if (OPACITY_PROPS.has(prop)) return 'opacity';
  if (BORDER_SHORTHAND_PROPS.has(prop)) return 'border';
  return 'unknown';
}

// Matches hex (#fff, #ffffff, #ffffff00), rgb(a)(...), hsl(a)(...), oklch(...), oklab(...), hwb(), color()
export const COLOR_REGEX =
  /#(?:[0-9a-fA-F]{3,8})\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)/g;

// A length/number token: 16px, 1.5rem, 100%, 2em, 0 (unitless zero is valid but low-signal)
export const LENGTH_REGEX = /-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ch|ex|pt|pc|in|cm|mm|fr)/g;

// Matches a bare integer (for z-index, font-weight numeric)
export const INTEGER_REGEX = /^-?\d+$/;

// media query breakpoint extraction, e.g. (min-width: 768px)
export const MEDIA_BREAKPOINT_REGEX = /(min-width|max-width|min-height|max-height)\s*:\s*(-?\d*\.?\d+(?:px|em|rem))/g;

// Time durations for transitions/animations: 200ms, 0.3s
export const TIME_REGEX = /-?\d*\.?\d+(?:ms|s)\b/g;

// Easing keywords/functions for transitions
export const EASING_REGEX = /cubic-bezier\([^)]*\)|steps\([^)]*\)|linear\([^)]*\)|\bease-in-out\b|\bease-in\b|\bease-out\b|\bease\b|\blinear\b|\bstep-start\b|\bstep-end\b/g;

// Opacity is a unitless 0–1 decimal, or a 0–100% percentage — not a length.
export const OPACITY_VALUE_REGEX = /^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+|\d{1,3}%)$/;

export const SHADOW_SHORTHAND_PROPS = SHADOW_PROPS;
export const BORDER_SHORTHAND_PROPS_SET = BORDER_SHORTHAND_PROPS;
export const TRANSITION_SHORTHAND_PROPS = new Set(['transition']);
