/**
 * The official Ritual brand mark, served from /public/ritual-mark.svg.
 * Kept as a small wrapper so every usage (header, splash, footer, loading
 * state) renders the same asset and can be sized/animated via props.
 */
export function RitualMark({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/ritual-mark.svg"
      width={size}
      height={size}
      alt="Ritual"
      className={className}
    />
  );
}
