// Typeable company/client picker backed by server-side search (see
// AsyncSearchableSelect.jsx). Searches company name and TRN in one request
// (see company.controller.js's buildCompanySearchClause) - typing "Horizon
// Edge" or "Test Client" matches anywhere in the name, case-insensitively,
// across the FULL tenant company list, not just whichever page happened to
// load first.
//
// Reuse this instead of hand-rolling another company `<select>`/Autocomplete
// - every page that needs "pick one company" (Invoice generation, Assign to
// Company, Assign Employee) should behave identically.
import { useCallback } from "react";
import { companiesApi } from "../../api/companies";
import { normalizeListResponse } from "../../utils/apiResponseNormalizer";
import AsyncSearchableSelect from "./AsyncSearchableSelect";

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string, company: {value:string,label:string}|null) => void} props.onChange
 * @param {string} [props.valueLabel]
 * @param {"clients"|"all"} [props.scope] - "clients" (default) uses getClientCompanies; "all" uses getCompanies
 * @param {boolean} [props.disabled]
 * @param {string} [props.placeholder]
 */
function SearchableCompanyDropdown({
  value,
  onChange,
  valueLabel,
  scope = "clients",
  disabled,
  placeholder,
  style,
}) {
  const fetchOptions = useCallback(
    async (search) => {
      const params = { page: 1, limit: 20 };
      if (search) params.search = search;
      const response =
        scope === "all" ? await companiesApi.getCompanies(params) : await companiesApi.getClientCompanies(params);
      const { items } = normalizeListResponse(response);
      return items.map((company) => ({ value: company._id || company.id, label: company.name }));
    },
    [scope]
  );

  return (
    <AsyncSearchableSelect
      value={value}
      onChange={onChange}
      valueLabel={valueLabel}
      fetchOptions={fetchOptions}
      queryKey={["companies", "dropdown", scope]}
      placeholder={placeholder || "Select or type to search"}
      noOptionsText="No companies found"
      disabled={disabled}
      style={style}
    />
  );
}

export default SearchableCompanyDropdown;
