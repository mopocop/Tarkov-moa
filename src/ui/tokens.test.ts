/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOKEN_HEX } from './tokens';

// Read from disk: vitest's CSS handling turns a `?raw` import of a .css file
// into an empty string, and import.meta.url is not a file: URL under jsdom.
const css = readFileSync(resolve(process.cwd(), 'src/ui/tokens.css'), 'utf8');

// camelCase key → the CSS custom property it mirrors.
const toVar = (key: string) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

describe('TOKEN_HEX', () => {
  it.each(Object.entries(TOKEN_HEX))('%s matches tokens.css', (key, hex) => {
    const m = css.match(new RegExp(`${toVar(key)}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
    expect(m, `${toVar(key)} not found in tokens.css`).not.toBeNull();
    expect(m![1].toLowerCase()).toBe(hex.toLowerCase());
  });
});
