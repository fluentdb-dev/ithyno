import { useStore } from "../store";
import { SpecView } from "../components/SpecView";

export function Specs() {
  const specs = useStore((s) => s.state?.specs ?? []);

  if (specs.length === 0) {
    return <p className="empty">No specs under openspec/specs/.</p>;
  }

  return (
    <div className="specs-page">
      <h2>Current Specs</h2>
      <div className="specs-list">
        {specs.map((spec) => (
          <SpecView key={spec.domain} spec={spec} />
        ))}
      </div>
    </div>
  );
}
