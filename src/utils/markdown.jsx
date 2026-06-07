import { open as shellOpen } from "@tauri-apps/plugin-shell";

// Inline markdown renderer for release notes and similar prose.
// Handles **bold**, [link](url), `code`, and bare https URLs in a
// single left-to-right pass. Block-level constructs (headings,
// bullets, paragraphs) are the caller's responsibility — this just
// turns one line of source into a JSX fragment array.
export function renderMarkdownInline(text) {
  const parts = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const codeMatch = remaining.match(new RegExp("`([^`]+)`"));
    const urlMatch = remaining.match(/https?:\/\/[^\s)]+/);
    let earliest = null;
    let type = null;
    for (const [t, m] of [
      ["bold", boldMatch],
      ["link", linkMatch],
      ["code", codeMatch],
      ["url", urlMatch],
    ]) {
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = m;
        type = t;
      }
    }
    if (!earliest) {
      parts.push(remaining);
      break;
    }
    if (earliest.index > 0) parts.push(remaining.slice(0, earliest.index));
    if (type === "bold")
      parts.push(
        <strong key={key++} className="text-text-secondary font-semibold">
          {earliest[1]}
        </strong>
      );
    else if (type === "link") {
      const url = earliest[2];
      parts.push(
        <span
          key={key++}
          onClick={() => shellOpen(url)}
          className="text-accent-blue hover:underline cursor-pointer break-all"
        >
          {earliest[1]}
        </span>
      );
    } else if (type === "url") {
      const url = earliest[0];
      parts.push(
        <span
          key={key++}
          onClick={() => shellOpen(url)}
          className="text-accent-blue hover:underline cursor-pointer break-all"
        >
          {url}
        </span>
      );
    } else if (type === "code")
      parts.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-base-600 text-[10px] font-mono text-text-secondary"
        >
          {earliest[1]}
        </code>
      );
    remaining = remaining.slice(earliest.index + earliest[0].length);
  }
  return parts;
}
