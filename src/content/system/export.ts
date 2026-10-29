import type { DesignSystem } from './build';

// Exports of the site's own design system. Declared tokens keep the names the site gave them; values
// that were only observed are named by what they are (a hex, a pixel value, "shadow-1"), so nothing
// here claims a meaning the site never stated.

export type ExportFormat = 'css' | 'tailwind' | 'scss' | 'dtcg' | 'json' | 'md';

export interface ExportFile {
  label: string;
  filename: string;
  mime: string;
  text: string;
}

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  css: 'CSS vars',
  tailwind: 'Tailwind v4',
  scss: 'SCSS',
  dtcg: 'DTCG',
  json: 'JSON',
  md: 'DESIGN.md',
};

const bare = (name: string): string => name.replace(/^--/, '');
const slug = (v: string): string => v.toLowerCase().replace(/#/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const quoteFamily = (family: string): string => (/[\s,]/.test(family) ? `"${family}"` : family);

type Pair = [name: string, value: string];

// Tokens the site declared, then what it uses without having named it.
function declared(ds: DesignSystem, mode: 'light' | 'dark'): Pair[] {
  if (mode === 'dark') return ds.tokens.filter((t) => t.dark).map((t) => [bare(t.name), t.dark as string]);
  return ds.tokens.map((t) => [bare(t.name), t.value]);
}

function observed(ds: DesignSystem): Pair[] {
  const named = new Set(ds.tokens.map((t) => bare(t.name)));
  const out: Pair[] = [];
  const add = (name: string, value: string): void => {
    if (!named.has(name)) out.push([name, value]);
  };
  // A colour already held by a declared token is not repeated.
  for (const c of ds.colors) if (!c.tokens.length) add(`color-${slug(c.hex)}`, c.hex);
  ds.fonts.forEach((f) => add(`font-${slug(f.family)}`, quoteFamily(f.family)));
  ds.shadows.forEach((s, i) => !s.tokens.length && add(`shadow-${i + 1}`, s.value));
  ds.radii.forEach((r) => !r.tokens.length && add(`radius-${slug(r.value)}`, r.value));
  ds.spacing.forEach((s) => !s.tokens.length && add(`space-${slug(s.value)}`, s.value));
  ds.gradients.forEach((g, i) => !g.tokens.length && add(`gradient-${i + 1}`, g.value));
  return out;
}

const block = (selector: string, pairs: Pair[]): string =>
  pairs.length ? `${selector} {\n${pairs.map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}\n` : '';

const header = (ds: DesignSystem): string => `Read by PixelPeek from ${ds.source.url}`;

const darkBlock = (ds: DesignSystem): string => {
  const dark = declared(ds, 'dark');
  return dark.length ? `\n${block('.dark', dark)}` : '';
};

function cssText(ds: DesignSystem): string {
  return `/* ${header(ds)} */\n${block(':root', [...declared(ds, 'light'), ...observed(ds)])}${darkBlock(ds)}`;
}

function dtcg(ds: DesignSystem): string {
  const group = (items: [string, string, string][]): Record<string, unknown> =>
    Object.fromEntries(items.map(([k, v, type]) => [k, { $value: v, $type: type }]));
  const typeOf = (kind: string): string => ({ color: 'color', dimension: 'dimension', font: 'fontFamily', shadow: 'shadow' }[kind] ?? 'string');

  const tree: Record<string, unknown> = {
    $description: header(ds),
    declared: group(ds.tokens.map((t) => [bare(t.name), t.alias ? `{declared.${bare(t.alias)}}` : t.value, typeOf(t.kind)])),
    color: group(ds.colors.filter((c) => !c.tokens.length).map((c) => [slug(c.hex), c.hex, 'color'])),
    fontFamily: group(ds.fonts.map((f) => [slug(f.family), quoteFamily(f.family), 'fontFamily'])),
    textStyle: Object.fromEntries(
      ds.textStyles.map((t) => [
        slug(t.name),
        { $type: 'typography', $value: { fontFamily: t.family, fontSize: t.size, fontWeight: t.weight, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing } },
      ]),
    ),
    shadow: group(ds.shadows.map((s, i) => [s.tokens[0] ? bare(s.tokens[0]) : `shadow-${i + 1}`, s.value, 'shadow'])),
    radius: group(ds.radii.map((r) => [slug(r.value), r.value, 'dimension'])),
    spacing: group(ds.spacing.map((s) => [slug(s.value), s.value, 'dimension'])),
  };
  return JSON.stringify(tree, null, 2);
}

function markdown(ds: DesignSystem): string {
  const lines: string[] = ['# Design system', '', `Read from ${ds.source.url}${ds.source.title ? ` ("${ds.source.title}")` : ''} with PixelPeek. Every value is taken from the page.`];

  if (ds.tokens.length) {
    lines.push('', '## Variables declared by the site', '', '| Name | Value | Dark |', '| --- | --- | --- |');
    for (const t of ds.tokens) lines.push(`| \`${t.name}\` | \`${t.value}\`${t.alias ? '' : t.resolved !== t.value ? ` → \`${t.resolved}\`` : ''} | ${t.dark ? `\`${t.dark}\`` : ''} |`);
  }

  lines.push('', '## Colors in use', '', '| Color | Surface | Text | Border | Icon | Token |', '| --- | --- | --- | --- | --- | --- |');
  for (const c of ds.colors.slice(0, 40)) lines.push(`| ${c.hex} | ${c.surface} | ${c.text} | ${c.border} | ${c.icon} | ${c.tokens.map((t) => `\`${t}\``).join(', ')} |`);

  if (ds.textStyles.length) {
    lines.push('', '## Text styles', '', '| Style | Font | Size | Weight | Line height | Letter spacing |', '| --- | --- | --- | --- | --- | --- |');
    for (const t of ds.textStyles) lines.push(`| ${t.name} | ${t.family} | ${t.size} | ${t.weight} | ${t.lineHeight} | ${t.letterSpacing} |`);
  }
  if (ds.shadows.length) lines.push('', '## Effect styles (shadows)', '', ...ds.shadows.map((s) => `- ${s.name}: \`${s.value}\``));
  if (ds.radii.length) lines.push('', '## Corner radius', '', ...ds.radii.map((r) => `- ${r.name}${r.name !== r.value ? `: ${r.value}` : ''} (${r.count}×)`));
  if (ds.spacing.length) lines.push('', '## Spacing in use', '', ...ds.spacing.map((s) => `- ${s.name}${s.name !== s.value ? `: ${s.value}` : ''} (${s.count}×)`));
  if (ds.gradients.length) lines.push('', '## Gradients', '', ...ds.gradients.map((g) => `- ${g.name}: \`${g.value}\``));
  return `${lines.join('\n')}\n`;
}

export function buildExport(ds: DesignSystem, format: ExportFormat): ExportFile {
  const label = EXPORT_LABELS[format];
  switch (format) {
    case 'css':
      return { label, filename: 'tokens.css', mime: 'text/css', text: cssText(ds) };
    case 'tailwind':
      return {
        label,
        filename: 'theme.css',
        mime: 'text/css',
        text: `/* ${header(ds)} */\n@import "tailwindcss";\n\n${block('@theme', [...declared(ds, 'light'), ...observed(ds)])}${darkBlock(ds)}`,
      };
    case 'scss':
      return {
        label,
        filename: 'tokens.scss',
        mime: 'text/x-scss',
        text: `// ${header(ds)}\n${[...declared(ds, 'light'), ...observed(ds)].map(([k, v]) => `$${k}: ${v};`).join('\n')}\n`,
      };
    case 'dtcg':
      return { label, filename: 'tokens.json', mime: 'application/json', text: dtcg(ds) };
    case 'json':
      return { label, filename: 'design-system.json', mime: 'application/json', text: JSON.stringify(ds, null, 2) };
    case 'md':
      return { label, filename: 'DESIGN.md', mime: 'text/markdown', text: markdown(ds) };
  }
}

