import {
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Button,
} from "@mui/material";

function SelectCompanyStep({ value, onChange, onNext, onBack }) {
  const isNextDisabled = !value;

  return (
    <Box>
      <Box sx={{ mt: "24px" }}>
        <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
          Select a company
        </Typography>

        <FormControl>
          <Select
            value={value}
            displayEmpty
            onChange={(e) => onChange(e.target.value)}
            sx={{
              width: 580,
              height: 44,
              borderRadius: "8px",
              fontSize: 14,
              "& .MuiSelect-select": {
                display: "flex",
                alignItems: "center",
                height: "44px",
                padding: "0 14px",
              },
            }}
          >
            <MenuItem value="" disabled>
              Select
            </MenuItem>
            <MenuItem value="mcc">
              MCC on Demand Labor Supply LLC
            </MenuItem>
            <MenuItem value="bkc">
              BKC Staffing Services
            </MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Box
        sx={{
          mt: "40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Button
          variant="text"
          onClick={onBack}
          sx={{
            textTransform: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Back
        </Button>

        <Button
          variant="contained"
          disabled={isNextDisabled}
          onClick={onNext}
          sx={{
            height: 32,
            px: "24px",
            borderRadius: "8px",
            textTransform: "none",
            fontSize: 14,
            fontWeight: 500,
            boxShadow: "none",
          }}
        >
          Next
        </Button>
      </Box>
    </Box>
  );
}

export default SelectCompanyStep;
