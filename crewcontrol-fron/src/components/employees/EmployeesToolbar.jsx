import {
  Box,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const EmployeesToolbar = ({
  searchQuery,
  onSearchChange,
  page,
  rowsPerPage,
  totalCount,
  onPageChange,
}) => {
  const start = totalCount ? (page - 1) * rowsPerPage + 1 : 0;
  const end = Math.min(page * rowsPerPage, totalCount);

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: "background.paper",
        borderRadius: 2,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <TextField
        size="small"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by name, ID, trade"
        sx={{ width: 320 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      <Box display="flex" alignItems="center" gap={1}>
        <Typography variant="body2" color="text.secondary">
          {start}-{end} of {totalCount}
        </Typography>
        <IconButton
          size="small"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          size="small"
          disabled={end >= totalCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRightIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

export default EmployeesToolbar;
