import type { PublicOrder } from "@/lib/types";

const STEPS = ["Delivering", "Delivered", "Received", "Completed"] as const;

/**
 * Which step is "current":
 * 0 while we deliver, 2 once delivered (waiting for the customer to confirm),
 * 4 when completed (every step done, Received and Completed happen together).
 */
export function stepIndex(order: Pick<PublicOrder, "status">): number {
  if (order.status === "completed") return 4;
  if (order.status === "delivered") return 2;
  return 0;
}

export function StatusSteps({ order }: { order: Pick<PublicOrder, "status"> }) {
  const current = stepIndex(order);
  const label = current >= STEPS.length ? "Completed" : STEPS[current];
  return <ol className="steps" aria-label={`Order progress: ${label}`}>
    {STEPS.map((name, i) => {
      const state = i < current ? "done" : i === current ? "current" : "todo";
      return <li key={name} className={`step step-${state}`}>
        <span className="step-dot" aria-hidden="true">
          {state === "done" && <svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9" /></svg>}
        </span>
        <span className="step-label">{name}</span>
      </li>;
    })}
  </ol>;
}
