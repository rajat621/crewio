import { Box, Typography } from "@mui/material";
import { formatCompactAmount } from "../../utils/financeFormat";

// Renders "45 k / AED" as three differently-weighted spans (matches the
// two-tier size treatment in the Finance stat cards) while still slotting
// into KpiCard's single `value` prop.
function FinanceStatValue({ amount, unit = "AED" }) {
  const compact = formatCompactAmount(amount);
  const [numberPart, ...rest] = compact.split(" ");
  const suffix = rest.join(" ");

  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
      <Typography component="span" fontSize={32} fontWeight={600} color="var(--text-primary)" lineHeight="32px">
        {numberPart}
      </Typography>
      {suffix && (
        <Typography component="span" fontSize={16} fontWeight={600} color="var(--text-primary)">
          {suffix}
        </Typography>
      )}
      <Typography component="span" fontSize={14} fontWeight={400} color="var(--text-secondary)">
        / {unit}
      </Typography>
    </Box>
  );
}

export default FinanceStatValue;
