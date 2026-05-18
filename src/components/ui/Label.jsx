// Tiny uppercase section label — the 30+ places in the codebase that used
// `text-[10px] font-display font-bold text-text-muted uppercase tracking-wider`
// inline are now this component. Per philosophy rule 1, the class soup is
// a concept ("section heading"); one source of truth makes it consistent
// and lets future tweaks (color, size, spacing) hit one file.
//
// Default tag is <p>; pass `as="h2"` (or `"span"` etc.) for semantic
// section headings. `className` is appended for spacing tweaks like mb-2.
export function Label({ as: Tag = "p", className = "", children, ...rest }) {
  return (
    <Tag
      className={`text-[10px] font-display font-bold text-text-muted uppercase tracking-wider ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}
