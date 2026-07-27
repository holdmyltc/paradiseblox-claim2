import type { OrderStatus } from "@/lib/types";

const steps: Array<{ key: OrderStatus; label: string }> = [
  { key:"paid", label:"Paid" },
  { key:"in_progress", label:"In progress" },
  { key:"delivered", label:"Delivered" },
  { key:"completed", label:"Completed" },
];

// terminal states that are NOT part of the four-step path
const TERMINAL: Record<string, string> = {
  cancelled: "Order cancelled",
  refunded: "Order refunded",
};

export function StatusSteps({ status }: { status: OrderStatus }) {
  const terminal = TERMINAL[status as string];

  // A cancelled order isn't "step 0 of 4". Without this the old findIndex
  // returned -1, Math.max clamped it to 0, and the bar showed "Paid" as
  // current — telling the customer their dead order was still in flight.
  if (terminal) {
    return <div className="progress progress-terminal" aria-label={terminal}>
      <span className="progress-terminal-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </span>
      <span className="progress-terminal-label">{terminal}</span>
    </div>;
  }

  const index = Math.max(0, steps.findIndex((step) => step.key === status));
  return <div className="progress" aria-label={`Order status: ${steps[index]?.label || status}`}>
    <div className="progress-row">
      {steps.map((step, i) => <div key={step.key} className={`progress-step ${i < index ? "done" : ""} ${i === index ? "current" : ""}`}>
        <span className="progress-icon" aria-hidden="true">{i < index ? <svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg> : i + 1}</span>
        <span>{step.label}</span>
      </div>)}
    </div>
  </div>;
}
