import { Link } from "react-router-dom";

export function TagChip({ tag, small = false }: { tag: string; small?: boolean }) {
  const i = tag.indexOf("/");
  const ns = i < 0 ? "other" : tag.slice(0, i);
  const name = i < 0 ? tag : tag.slice(i + 1);
  return (
    <Link
      to={`/tags/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`}
      className={`tag-chip clickable${small ? " small" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {tag}
    </Link>
  );
}

export function TagChipList({ tags, small = false }: { tags: string[] | undefined; small?: boolean }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="tag-chips">
      {tags.map((t) => (
        <TagChip key={t} tag={t} small={small} />
      ))}
    </span>
  );
}
