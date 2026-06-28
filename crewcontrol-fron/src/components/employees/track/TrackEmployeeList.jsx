import { Box, Typography, TextField, InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import TrackEmployeeTable from "./TrackEmployeeTable";

function TrackEmployeeList({ rows }) {
  return (
    <Box
      sx={{
        width: 360,
        border: "1px solid var(--border-card)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <Typography fontSize={16} fontWeight={600}>
          Employee’s
        </Typography>
        <Typography fontSize={14} color="var(--text-secondary)">
          20/20
        </Typography>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <TextField
          fullWidth
          variant="standard"
          placeholder="Search for application name..."
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Table */}
      <Box sx={{ px: 2, pb: 2 }}>
        <TrackEmployeeTable rows={rows} />
      </Box>
    </Box>
  );
}

export default TrackEmployeeList;

