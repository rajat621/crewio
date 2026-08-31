// Generic typeable dropdown backed by SERVER-SIDE search, replacing the old
// SearchableSelect.jsx pattern of loading one capped page (200 employees /
// 500 companies) once and filtering only within it client-side - which is
// why typing a full name often found nothing even though the record existed
// (see SearchableEmployeeDropdown.jsx / SearchableCompanyDropdown.jsx for
// the domain-specific wrappers that actually call the API).
//
// Debounced (default 300ms) so "H", "Ho", "Hor", "Hori", "Horizon" fires
// ONE request, not five. Keyed React Query cache means an in-flight
// request for an older, now-abandoned search term can never clobber a
// newer one's displayed results - each debounced term gets its own cache
// entry, and this component only ever renders whatever the CURRENT term's
// query state is, regardless of what order responses arrive in. Also means
// re-typing a term already searched this session is instant (cached), and
// two components searching the same term share one request instead of
// duplicating it.
import { useEffect, useMemo, useState } from "react";
import { Autocomplete, TextField, Box, CircularProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

const BORDER = "var(--border-card)";
const BLUE = "var(--color-primary)";
const DEBOUNCE_MS = 300;

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * @param {object} props
 * @param {string} props.value - currently selected option's id/value ("" for none)
 * @param {(value: string, option: {value:string,label:string}|null) => void} props.onChange
 * @param {string} [props.valueLabel] - display label for `value` when it isn't (yet) present in
 *   the currently loaded search results, e.g. when editing a record that already has a selection
 *   before the user has typed anything. Falls back to searching the loaded options if omitted.
 * @param {(searchTerm: string) => Promise<{value:string,label:string}[]>} props.fetchOptions
 * @param {any[]} props.queryKey - React Query key EXCLUDING the search term (the term is appended
 *   internally) - callers pass whatever distinguishes this dropdown's result set, e.g.
 *   ['employees','dropdown', companyId].
 * @param {string} [props.placeholder]
 * @param {string} [props.noOptionsText]
 * @param {boolean} [props.disabled]
 */
function AsyncSearchableSelect({
  value,
  onChange,
  valueLabel,
  fetchOptions,
  queryKey,
  placeholder = "Select or type to search",
  noOptionsText = "No results found",
  disabled = false,
  style,
}) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedInput = useDebouncedValue(inputValue, DEBOUNCE_MS);

  const { data: options = [], isFetching } = useQuery({
    queryKey: [...queryKey, "search", debouncedInput],
    queryFn: () => fetchOptions(debouncedInput),
    // Only search while the dropdown is actually open - no reason to hit
    // the API for a field the user hasn't interacted with yet.
    enabled: open,
    placeholderData: (previous) => previous,
    staleTime: 30000,
  });

  const selectedOption = useMemo(() => {
    if (!value) return null;
    const fromResults = options.find((o) => o.value === value);
    if (fromResults) return fromResults;
    return { value, label: valueLabel || value };
  }, [value, valueLabel, options]);

  return (
    <Autocomplete
      disabled={disabled}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={options}
      loading={isFetching}
      value={selectedOption}
      inputValue={open ? inputValue : selectedOption?.label || ""}
      onInputChange={(_event, next, reason) => {
        // "reset" fires when Autocomplete syncs its display text back to
        // the selected value's label (on blur/selection) - not a real edit,
        // and re-searching for e.g. a full employee name as if it were
        // typed would just refetch the same term pointlessly.
        if (reason === "reset") return;
        setInputValue(next);
      }}
      onChange={(_event, next) => onChange(next ? next.value : "", next)}
      getOptionLabel={(option) => option?.label || ""}
      isOptionEqualToValue={(option, val) => option.value === val?.value}
      filterOptions={(opts) => opts} // server already filtered - don't re-filter client-side
      noOptionsText={isFetching ? "Searching..." : noOptionsText}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isFetching ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
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

export default AsyncSearchableSelect;
