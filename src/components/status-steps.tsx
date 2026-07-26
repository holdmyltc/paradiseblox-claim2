import type { OrderStatus } from "@/lib/types";

const steps: Array<{ key: OrderStatus; label: string }> = [
  { key:"paid", label:"Paid" },
  { key:"in_progress", label:"In progress" },
  { key:"delivered", label:"Delivered" },
  { key:"completed", label:"Completed" },
];

export function StatusSteps({ status }: { status: OrderStatus }) {
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
