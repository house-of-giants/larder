/** A recipe's tags as quiet chips: words to scan, not controls. */
export function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-sm border border-border bg-card px-2 py-0.5 text-caption text-muted-foreground"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}
