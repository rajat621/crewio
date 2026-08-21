import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  Select,
  MenuItem,
} from "@mui/material";

const INPUT_SX = {
  height: 44,
  borderRadius: "8px",
  fontSize: 14,
  "& .MuiInputBase-input": {
    padding: "10px 14px",
  },
};

function ConfirmCompanyStep({ data, onChange, onNext, onBack }) {
  return (
    <Box sx={{ mt: "24px" }}>
      <Box
        sx={{
          mt: "24px",
          width: 580,
          display: "grid",
          gap: "16px",
        }}
      >
        {/* Company Name (SELECT) */}
        <Box>
          <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
            Company Name
          </Typography>

          <FormControl fullWidth>
            <Select
              value={data.name}
              onChange={(e) => onChange("name", e.target.value)}
              displayEmpty
              sx={INPUT_SX}
            >
              <MenuItem value="" disabled>
                Select
              </MenuItem>
              <MenuItem value="MCC on Demand labors supply LLC">
                MCC on Demand labors supply LLC
              </MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Telephone Number */}
        <Box>
          <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
            Telephone Number
          </Typography>

          <TextField
            value={data.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            fullWidth
            sx={INPUT_SX}
          />
        </Box>

        {/* PO BOX + FAX */}
        <Box sx={{ display: "flex", gap: "16px" }}>
          <Box sx={{ flex: 1 }}>
            <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
              P.O. Box
            </Typography>

            <TextField
              value={data.poBox}
              onChange={(e) => onChange("poBox", e.target.value)}
              fullWidth
              sx={INPUT_SX}
            />
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
              Fax Number
            </Typography>

            <TextField
              value={data.fax}
              onChange={(e) => onChange("fax", e.target.value)}
              fullWidth
              sx={INPUT_SX}
            />
          </Box>
        </Box>

        {/* Company Address */}
        <Box>
          <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
            Company Address
          </Typography>

          <TextField
            value={data.address}
            onChange={(e) => onChange("address", e.target.value)}
            fullWidth
            sx={INPUT_SX}
          />
        </Box>

        {/* TRN */}
        <Box>
          <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
            Tax Registration Number ( TRN )
          </Typography>

          <TextField
            value={data.trn}
            onChange={(e) => onChange("trn", e.target.value)}
            fullWidth
            sx={INPUT_SX}
          />
        </Box>
      </Box>

      {/* ACTIONS */}
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

export default ConfirmCompanyStep;
