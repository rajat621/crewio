import { Box, Typography, Button, OutlinedInput } from "@mui/material";

const FIELDS = [
  { key: "name",    label: "Company Name"                     },
  { key: "phone",   label: "Tel no."                          },
  { key: "poBox",   label: "PO Box"                           },
  { key: "fax",     label: "Fax no."                          },
  { key: "address", label: "Address"                          },
  { key: "trn",     label: "Tax Registration Number ( TRN )"  },
];

function CompanyDetailsPanel({
  company,
  editable = false,
  onEdit,
  onCancel,
  onSave,
  onFieldChange,
}) {
  return (
    <Box
      sx={{
        border: "1px solid var(--border-card)",
        borderRadius: "8px",
        p: "20px 16px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* ── Panel header ── */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: "24px",
        }}
      >
        <Typography sx={{ fontSize: "18px", fontWeight: 500, color: "var(--text-primary)" }}>
          Company Details
        </Typography>

        {!editable && (
          <Button
            onClick={onEdit}
            sx={{
              textTransform: "none",
              lineHeight: "20px",
              fontSize: "12px",
              fontWeight: 500,
              color: "#374151",
              border: "1px solid var(--border-input-hover)",
              borderRadius: "8px",
              p: "6px 12px",
              height: "32px",
              minWidth: "unset",
              "&:hover": { backgroundColor: "var(--bg-surface)", borderColor: "var(--text-disabled)" },
            }}
          >
            Edit
          </Button>
        )}
      </Box>

      {/* ── Fields ── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
        {FIELDS.map(({ key, label }) => (
          <Box key={key}>
            <Typography
              sx={{
                fontSize: "14px",
                color: "var(--text-secondary)",
                fontWeight: 400,
                mb: "8px",
              }}
            >
              {label}
            </Typography>

            <OutlinedInput
              fullWidth
              size="small"
              value={company?.[key] || ""}
              readOnly={!editable}
              onChange={(e) => onFieldChange?.(key, e.target.value)}
              sx={{
                fontSize: "14px",
                color: "var(--text-primary)",
                lineHeight: "20px",
                letterSpacing: "0.5px",
                backgroundColor: "var(--bg-surface)",
                borderRadius: "8px",
                height: "44px",
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: "var(--border-input)",
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: editable ? "var(--color-primary)" : "var(--border-card)",
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: "var(--color-primary)",
                  borderWidth: "1.5px",
                },
                // Cursor not-allowed in read-only view
                ...(!editable && {
                  cursor: "default",
                  color: "var(--text-secondary)",
                  "& input": { cursor: "default" },
                }),
              }}
            />
          </Box>
        ))}
      </Box>

      {/* ── Bottom: Cancel/Save OR info note ── */}
      <Box sx={{ mt: "16px" }}>
        {editable ? (
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <Button
              onClick={onCancel}
              sx={{
                textTransform: "none",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--color-primary)",
                // border: "1px solid var(--border-input-hover)",
                borderRadius: "8px",
                p: "6px 12px",
                height: "34px",
                "&:hover": { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              variant="contained"
              sx={{
                textTransform: "none",
                fontSize: "12px",
                fontWeight: 500,
                backgroundColor: "var(--color-primary)",
                borderRadius: "8px",
                p: "6px 12px",
                height: "32px",
                width: "76px",
                boxShadow: "none",
                "&:hover": { backgroundColor: "var(--color-primary)", boxShadow: "none" },
              }}
            >
              Save
            </Button>
          </Box>
        ) : (
          <Box
            sx={{
              backgroundColor: "#EFF6FF",
              borderRadius: "8px",
              px: "14px",
              py: "10px",
              textAlign: "center",
            }}
          >
            <Typography
              sx={{ fontSize: "12px", color: "var(--color-primary)", fontWeight: 400 }}
            >
              These details are used for invoices and official documents.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default CompanyDetailsPanel;
