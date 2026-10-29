import type { ElementCapture } from '../types';
import { toHex } from '../capture/color';

// A prompt a coding agent can build from: what the element is, how big, how it is styled
// (Tailwind and plain CSS), what it holds, and where it sits. Written from the capture alone, so
// it works wherever the capture does (page or side panel).
export function buildAiPrompt(capture: ElementCapture): string {
  const { layout } = capture;
  const t = layout.typography;
  const lines: string[] = [];

  lines.push(`Recreate this UI element as a React component styled with Tailwind CSS. Match the values below exactly.`);
  lines.push('');
  lines.push(`Element: <${capture.tagName}> (${capture.selector})`);
  lines.push(`Size: ${layout.boxModel.content.width} × ${layout.boxModel.content.height}px`);
  if (capture.text) lines.push(`Text: "${capture.text}"`);
  lines.push(`Location: ${capture.domPath.slice(-4).join(' > ')}`);
  lines.push('');

  if (layout.tailwind.length) {
    lines.push('Tailwind classes:');
    lines.push(layout.tailwind.join(' '));
    lines.push('');
  }

  lines.push('Design details:');
  if (t) {
    lines.push(`- Font: ${t.fontFamily}, ${t.fontSize} / ${t.lineHeight}, weight ${t.fontWeight}, letter spacing ${t.letterSpacing}`);
  }
  for (const c of layout.colors) lines.push(`- ${c.role[0].toUpperCase()}${c.role.slice(1)} color: ${toHex(c.value)}`);
  if (layout.contrast) lines.push(`- Text contrast: ${layout.contrast.ratio.toFixed(2)}:1 (${layout.contrast.aa ? 'passes' : 'fails'} WCAG AA)`);
  if (layout.fills.length) lines.push(`- Background gradient: ${layout.fills.map((f) => f.raw).join(', ')}`);
  const r = layout.cornerRadius;
  lines.push(`- Corner radius: ${r.topLeft} ${r.topRight} ${r.bottomRight} ${r.bottomLeft}`);
  for (const s of layout.effects.shadows) lines.push(`- ${s.type} shadow: ${s.x} ${s.y} blur ${s.blur} spread ${s.spread} ${s.color}`);
  const { padding, margin } = layout.boxModel;
  lines.push(`- Padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px; margin: ${margin.top}px ${margin.right}px ${margin.bottom}px ${margin.left}px`);
  if (layout.autoLayout) {
    lines.push(`- Parent layout: ${layout.autoLayout.direction}, gap ${layout.autoLayout.gap}, align ${layout.autoLayout.align}, distribute ${layout.autoLayout.distribute}`);
  }
  lines.push('');
  lines.push('CSS:');
  lines.push(...layout.rawCss);
  lines.push('');
  lines.push('Use semantic HTML, keep the component self-contained, and do not invent values that are not listed above.');
  return lines.join('\n');
}
