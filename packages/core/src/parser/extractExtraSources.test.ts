import { describe, expect, it } from 'vitest';
import { extractFromSource } from './extractor';

describe('LESS parsing', () => {
  it('extracts literals from mixin bodies and skips @variable definitions', () => {
    const less = `
@brand: #3B82F6;
.button() {
  color: #111111;
  padding: 8px;
}
.card {
  .button();
  background: #ffffff;
}
`;
    const occs = extractFromSource('theme.less', 'theme.less', less);
    expect(occs.some((o) => o.rawValue === '#3B82F6' && o.property.startsWith('@'))).toBe(false);
    expect(occs.some((o) => o.rawValue === '#111111')).toBe(true);
    expect(occs.some((o) => o.rawValue === '8px')).toBe(true);
    expect(occs.some((o) => o.rawValue === '#ffffff')).toBe(true);
  });
});

describe('unknown properties', () => {
  it('extracts lengths from flex/grid without taking keyword-only values', () => {
    const css = `.row { flex: 1 1 200px; grid-template-columns: 120px 1fr; display: grid; }`;
    const occs = extractFromSource('layout.css', 'layout.css', css);
    expect(occs.some((o) => o.rawValue === '200px' && o.category === 'spacing')).toBe(true);
    expect(occs.some((o) => o.rawValue === '120px' && o.category === 'spacing')).toBe(true);
    expect(occs.some((o) => o.rawValue === 'grid')).toBe(false);
  });
});

describe('Tailwind arbitrary values', () => {
  it('extracts colors and lengths from class attributes', () => {
    const html = `<div class="card bg-[#3B82F6] p-[16px] rounded-[8px]">Hi</div>`;
    const occs = extractFromSource('page.html', 'page.html', html);
    expect(occs.some((o) => o.category === 'color' && o.rawValue === '#3B82F6')).toBe(true);
    expect(occs.some((o) => o.category === 'spacing' && o.rawValue === '16px')).toBe(true);
    expect(occs.some((o) => o.category === 'radius' && o.rawValue === '8px')).toBe(true);
  });
});

describe('CSS-in-JS', () => {
  it('extracts from styled-components / css tagged templates', () => {
    const js = `
import styled, { css } from 'styled-components';
const Button = styled.button\`
  color: #111111;
  padding: 12px;
\`;
const extra = css\`background: #ffffff;\`;
`;
    const occs = extractFromSource('Button.tsx', 'Button.tsx', js);
    expect(occs.some((o) => o.rawValue === '#111111')).toBe(true);
    expect(occs.some((o) => o.rawValue === '12px')).toBe(true);
    expect(occs.some((o) => o.rawValue === '#ffffff')).toBe(true);
  });
});

describe('Vue SFC', () => {
  it('extracts from style blocks and Tailwind classes', () => {
    const vue = `
<template>
  <div class="bg-[#0f172a]">Hello</div>
</template>
<style>
.card { color: #111111; margin: 8px; }
</style>
`;
    const occs = extractFromSource('Card.vue', 'Card.vue', vue);
    expect(occs.some((o) => o.rawValue === '#111111')).toBe(true);
    expect(occs.some((o) => o.rawValue === '8px')).toBe(true);
    expect(occs.some((o) => o.rawValue === '#0f172a')).toBe(true);
    const tailwind = occs.find((o) => o.rawValue === '#0f172a');
    expect(tailwind?.line).toBeGreaterThan(1);
  });
});
