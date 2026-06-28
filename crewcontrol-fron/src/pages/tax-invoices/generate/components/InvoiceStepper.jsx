import { Box, Typography } from "@mui/material";

const steps = [
  "Select Company",
  "Confirm Company Details",
  "Invoice Details",
];

function StepCircle({ index, activeStep }) {
  const isActive = index === activeStep;
  const isCompleted = index < activeStep;

  return (
    <Box
      sx={{
        position: "relative",
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "2px solid",
        borderColor: isActive || isCompleted ? "var(--text-primary)" : "#C7C7C7",
        backgroundColor: "var(--bg-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 500,
        color: isActive ? "var(--bg-surface)" : "var(--text-primary)",
        zIndex: 1,

        ...(isActive && {
          "&::before": {
            content: '""',
            position: "absolute",
            // inset: "-1px",
            borderRadius: "50%",
            backgroundColor: "var(--bg-surface-secondary)",
            zIndex: -2,
          },
        }),

        "&::after": {
          content: '""',
          position: "absolute",
          inset: "3px", // 2px border + 3px gap
          borderRadius: "50%",
          backgroundColor: isActive ? "var(--text-primary)" : "#E6E6E6",
          zIndex: -1,
        },
      }}
    >
      {index + 1}
    </Box>
  );
}

function InvoiceStepper({ activeStep = 0 }) {
  return (
    <Box
      sx={{
        width: 282,
        padding: "32px 24px 0 24px",
        boxSizing: "border-box",
      }}
    >
      {steps.map((title, index) => {
        const isLast = index === steps.length - 1;
        const isActive = index === activeStep;
        const isCompleted = index < activeStep;

        return (
          <Box
            key={title}
            sx={{
              display: "flex",
              gap: "12px",
              alignItems: "flex-start",
            }}
          >
            {/* STEP ICON + CONNECTOR */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <StepCircle index={index} activeStep={activeStep} />

              {!isLast && (
                <Box
                  sx={{
                    width: "2px",
                    height: 82,
                    marginTop: "6px",
                    backgroundColor: isCompleted
                      ? "var(--text-primary)"
                      : "var(--border-input)",
                    opacity: isCompleted ? 1 : 0.5,
                  }}
                />
              )}
            </Box>

            {/* LABEL — FIXED ALIGNMENT */}
            <Box
              sx={{
                height: 36,              // match circle height
                display: "flex",
                alignItems: "center",    // vertical centering
              }}
            >
              <Typography
                fontSize={14}
                fontWeight={isActive ? 600 : 400}
                color={isActive ? "var(--text-primary)" : "var(--text-disabled)"}
              >
                {title}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export default InvoiceStepper;

