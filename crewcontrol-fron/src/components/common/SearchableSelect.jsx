// Typeable replacement for a plain `<select>`/`FSelect` dropdown. Several
// pages (Tax Invoice generation, Salary Slip generation, Expenses, the
// Employee "Assign to Company" dialog) pick a single company or employee
// out of a list that can run into the hundreds - a scrollable native
// <select> makes finding one entry by eye the only option. This wraps MUI's
// Autocomplete (already an indirect dependency via @mui/material) so the
// user can type to filter instead, while keeping the same visual footprint
// (44px height, var(--border-card) border, 8px radius, 14px font) as the
// rest of this codebase's hand-styled form inputs, rather than introducing
// MUI's own default TextField chrome.
import { Autocomplete, TextField, Box } from "@mui/material";

const BORDER = "var(--border-card)";
const BLUE = "var(--color-primary)";

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  disabled = false,
  style,
}) {
  const selected = options.find((o) => o.value === value) || null;

  return (
    <Autocomplete
      disabled={disabled}
      options={options}
      value={selected}
      onChange={(_event, next) => onChange(next ? next.value : "")}
      getOptionLabel={(option) => option?.label || ""}
      isOptionEqualToValue={(option, val) => option.value === val?.value}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          variant="outlined"
        />
      )}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.value} sx={{ fontSize: "14px" }}>
          {option.label}
        </Box>
      )}
      sx={{
        width: "100%",
        ...style,
        "& .MuiOutlinedInput-root": {
          height: "44px",
          borderRadius: "8px",
          padding: "0 8px 0 12px !important",
          fontSize: "14px",
          fontFamily: "inherit",
          background: "#fff",
        },
        "& .MuiOutlinedInput-input": {
          padding: "0 !important",
        },
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: BORDER,
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: BORDER,
        },
        "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: `${BLUE} !important`,
          borderWidth: "1px !important",
        },
      }}
    />
  );
}

export default SearchableSelect;
