declare module 'postcss-less' {
  import type { Root, ProcessOptions } from 'postcss';
  export function parse(less: string, options?: ProcessOptions): Root;
  export function stringify(node: unknown, builder: (part: string) => void): void;
}
