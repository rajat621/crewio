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

export default function TableToolbar({
  search,
  onSearch,
  searchPlaceholder = "Search for employee id, name...",
  page,
  rowsPerPage,
  total,
  onPrev,
  onNext,
  pagination = true,
  rootSx,
  searchSx,
  paginationTextSx,
  navButtonSx,
}) {
  const start = total ? (page - 1) * rowsPerPage + 1 : 0;
  const end = Math.min(page * rowsPerPage, total);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        px: 2.5,
        py: 2,
        ...rootSx,
      }}
    >
      <TextField
        variant="standard"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={searchPlaceholder}
        sx={{ width: 320, ...searchSx }}
        InputProps={{
          disableUnderline: true,
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {pagination && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography fontSize={12} color="text.secondary" sx={paginationTextSx}>
            {start}-{end} of {total}
          </Typography>

          <IconButton
            size="small"
            disabled={page === 1}
            onClick={onPrev}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, ...navButtonSx }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>

          <IconButton
            size="small"
            disabled={end >= total}
            onClick={onNext}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, ...navButtonSx }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
