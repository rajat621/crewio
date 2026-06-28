import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DoneIcon from "@mui/icons-material/Done";

const DARK   = "var(--text-primary)";
const BORDER = "var(--border-card)";

/* ═══════════════════════════════════════════════════════════════
   REUSABLE STEPPER COMPONENT
═══════════════════════════════════════════════════════════════ */

export function ReusableStepper({ currentStep, steps, subSteps = null }) {
  const DocIcon = DescriptionOutlinedIcon;

  const CheckIcon = () => (
    <DoneIcon sx={{ color: "#fff", fontSize: 18, fontWeight: "bold" }} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {steps.map((step, idx) => {
        const isCompleted = step.id < currentStep;
        const isActive    = step.id === currentStep;
        const isLast      = idx === steps.length - 1;
        const StepIcon = step.icon || DocIcon;

        // Show sub-steps only if provided and if this is the active/completed sub-step section
        const shouldShowSubSteps = subSteps && subSteps.parentStepId === step.id && 
                                   (isActive || isCompleted);

        return (
          <div key={step.id} style={{ position: "relative" }}>
            {/* ── STEP ROW ── */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              {/* Circle */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  ...(isCompleted ? {
                    background: DARK,
                    border: `2px solid ${DARK}`,
                  } : isActive ? {
                    background: "#fff",
                    border: `2px solid ${DARK}`,
                    padding: 5,
                    boxSizing: "border-box",
                  } : {
                    background: "#fff",
                    border: `2px solid ${BORDER}`,
                    padding: 5,
                    boxSizing: "border-box",
                  }),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {isCompleted ? (
                  <CheckIcon />
                ) : isActive ? (
                  <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <StepIcon sx={{ fontSize: 18, color: "#fff" }} />
                  </div>
                ) : (
<<<<<<< HEAD
                  <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--bg-surface-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <StepIcon sx={{ fontSize: 18, color: "var(--text-disabled)" }} />
=======
                  <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <StepIcon sx={{ fontSize: 18, color: "#9CA3AF" }} />
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                  </div>
                )}
              </div>

              {/* Text */}
              <div>
                <div style={{ fontSize: "8px", color: "var(--text-primary)", lineHeight: "14px", letterSpacing: "0.24px", textTransform: "uppercase" }}>
                  STEP {step.id}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    lineHeight: "22px",
                    letterSpacing: "0.42px",
                    color: isActive || isCompleted ? DARK : "var(--text-primary)",
                    marginTop: "0px",
                  }}
                >
                  {step.label}
                </div>
              </div>
            </div>

            {/* ── CONNECTOR + SUB-STEPS ── */}
            {!isLast && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginLeft: "22px" }}>
                {shouldShowSubSteps && subSteps.items ? (
                  /* Sub-step tree */
                  <div style={{ display: "flex", flexDirection: "column", width: "100%", paddingLeft: "0px" }}>
                    {subSteps.items.map((subStep, si) => {
                      const subCompleted = isCompleted || (isActive && si < (subSteps.currentSubStep || 0));
                      const subActive    = isActive && si === (subSteps.currentSubStep || 0);
                      return (
                        <div key={subStep.key} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "8px" }}>
                          {/* Connector from above */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: "1px", height: "8px", background: BORDER }} />
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                ...(subCompleted ? {
                                  background: DARK,
                                } : subActive ? {
                                  background: DARK,
                                  border: `2px solid ${DARK}`,
                                  padding: 2,
                                  boxSizing: "border-box",
                                } : {
                                  background: "var(--bg-surface-secondary)",
                                  border: `2px solid ${BORDER}`,
                                }),
                                flexShrink: 0,
                              }}
                            />
                            {si < subSteps.items.length - 1 && (
                              <div style={{ width: "1px", flex: 1, minHeight: "8px", background: BORDER }} />
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: subActive || subCompleted ? 600 : 400,
                              color: subActive || subCompleted ? DARK : "var(--text-disabled)",
                              paddingTop: "8px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {subStep.label}
                          </div>
                        </div>
                      );
                    })}
                    {/* connector to next main step */}
                    <div style={{ width: "1px", height: "16px", background: BORDER, marginTop: "8px" }} />
                  </div>
                ) : (
                  /* Normal connector line */
                  <div style={{ width: "1px", height: "32px", background: isCompleted ? DARK : BORDER }} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

