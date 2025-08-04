import { cn } from "@/lib/utils";

interface AnimatedCircularProgressBarProps {
  max: number;
  value: number;
  min: number;
  customValue?: React.ReactNode;
  gaugePrimaryColor: string;
  gaugeSecondaryColor: string;
  className?: string;
}

// Circle radius for the progress bar
const VIEWBOX_SIZE = 100;
const STROKE_WIDTH = 10;
const CIRCLE_RADIUS = (VIEWBOX_SIZE / 2) - (STROKE_WIDTH / 2);

// Threshold below which the secondary circle is displayed to show remaining progress
const SECONDARY_CIRCLE_THRESHOLD = 90;

export function AnimatedCircularProgressBar({
  max = 100,
  min = 0,
  value = 0,
  customValue = null,
  gaugePrimaryColor,
  gaugeSecondaryColor,
  className,
}: AnimatedCircularProgressBarProps) {
  const circumference = 2 * Math.PI * CIRCLE_RADIUS;
  const percentPx = circumference / 100;
  const currentPercent = Math.round(((value - min) / (max - min)) * 100);

  return (
    <div
      className={cn("relative size-40 text-2xl font-semibold", className)}
      style={
        {
          "--circle-size": "100px",
          "--circumference": circumference,
          "--percent-to-px": `${percentPx}px`,
          "--gap-percent": "5",
          "--offset-factor": "0",
          "--transition-length": "1s",
          "--transition-step": "200ms",
          "--delay": "0s",
          "--percent-to-deg": "3.6deg",
          transform: "translateZ(0)",
        } as React.CSSProperties
      }
    >
      <svg
        fill="none"
        className="size-full"
        strokeWidth="2"
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      >
        {currentPercent <= SECONDARY_CIRCLE_THRESHOLD && currentPercent >= 0 && (
          <circle
            cx="50"
            cy="50"
            r={CIRCLE_RADIUS}
            strokeWidth={STROKE_WIDTH}
            strokeDashoffset="0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-100"
            style={
              {
                stroke: gaugeSecondaryColor,
                "--stroke-percent": SECONDARY_CIRCLE_THRESHOLD - currentPercent,
                "--offset-factor-secondary": "calc(1 - var(--offset-factor))",
                strokeDasharray:
                  "calc(var(--stroke-percent) * var(--percent-to-px)) var(--circumference)",
                transform:
                  "rotate(calc(1turn - 90deg - (var(--gap-percent) * var(--percent-to-deg) * var(--offset-factor-secondary)))) scaleY(-1)",
                transition: "all var(--transition-length) ease var(--delay)",
                transformOrigin:
                  "calc(var(--circle-size) / 2) calc(var(--circle-size) / 2)",
              } as React.CSSProperties
            }
          />
        )}
        <circle
          cx="50"
          cy="50"
          r={CIRCLE_RADIUS}
          strokeWidth={STROKE_WIDTH}
          strokeDashoffset="0"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-100"
          style={
            {
              stroke: gaugePrimaryColor,
              "--stroke-percent": currentPercent,
              strokeDasharray:
                "calc(var(--stroke-percent) * var(--percent-to-px)) var(--circumference)",
              transition:
                "var(--transition-length) ease var(--delay),stroke var(--transition-length) ease var(--delay)",
              transitionProperty: "stroke-dasharray,transform",
              transform:
                "rotate(calc(-90deg + var(--gap-percent) * var(--offset-factor) * var(--percent-to-deg)))",
              transformOrigin:
                "calc(var(--circle-size) / 2) calc(var(--circle-size) / 2)",
            } as React.CSSProperties
          }
        />
      </svg>
      <span
        data-current-value={currentPercent}
        className="duration-[var(--transition-length)] delay-[var(--delay)] absolute inset-0 m-auto size-fit ease-linear animate-in fade-in"
      >
        {customValue ?? currentPercent}
      </span>
    </div>
  );
}
