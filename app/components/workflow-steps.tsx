"use client";

type WorkflowStepStatus = "complete" | "current" | "upcoming";

type WorkflowStep = {
  label: string;
  description: string;
  status: WorkflowStepStatus;
};

type WorkflowStepsProps = {
  steps: WorkflowStep[];
  className?: string;
};

export function WorkflowSteps({ steps, className = "" }: WorkflowStepsProps) {
  const classes = ["workflow-steps", className].filter(Boolean).join(" ");

  return (
    <ol className={classes} aria-label="当前流程进度">
      {steps.map((step, index) => (
        <li key={step.label} className={`workflow-step is-${step.status}`}>
          <div className="workflow-step-marker" aria-hidden="true">
            {step.status === "complete" ? "✓" : index + 1}
          </div>
          <div className="workflow-step-copy">
            <p className="workflow-step-label">{step.label}</p>
            <p className="workflow-step-description">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
