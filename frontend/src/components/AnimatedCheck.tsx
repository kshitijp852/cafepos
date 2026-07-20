// Self-drawing success tick: circle + check stroke animate in via
// stroke-dashoffset (keyframes in index.css). No external gif; crisp at any size.
export function AnimatedCheck({ size = 72 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      className="text-success check-pop"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Success"
    >
      <circle
        cx="26"
        cy="26"
        r="24"
        stroke="currentColor"
        strokeWidth="3"
        className="check-circle"
      />
      <path
        d="M15 27 L23 35 L38 18"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="check-mark"
      />
    </svg>
  );
}
