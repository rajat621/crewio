import { useMemo } from "react";
import { Grid } from "@mui/material";
import KpiCard from "./KpiCard";

/**
 * items = [
 *  {
 *    key: "assigned",
 *    label: "Assigned",
 *    icon,
 *    iconBg,
 *    iconColor,
 *    filterKey: "assignedStatus",
 *  }
 * ]
 */
function UniversalKpiRow({
  items,
  data,
  activeKey = null,
  onChange,
  clickable = true,
  // Full-population counts computed server-side (e.g. from
  // GET /api/employees/stats), keyed by item.key. When provided, these
  // are used directly instead of scanning `data` - `data` in that case
  // is just whatever page of the table happens to be loaded, and must
  // never be what a KPI card's number is based on. `fullTotal` is the
  // denominator (e.g. 1002), separate from `data.length` (a page size).
  counts = null,
  fullTotal = null,
}) {
  const total = counts ? (fullTotal ?? 0) : data.length;

  // Phase 3.2: was N independent full-array .filter() scans (one per
  // item) on every render, including every click of a KPI card itself
  // (activeKey changing doesn't affect the counts, but re-ran every scan
  // anyway). All 4 real callers (Assigned/Attendance/Passport/EmirateId
  // KpiRow) use one consistent filterKey across all their items -
  // verified by reading each - so this collapses to one true O(n) pass:
  // for each record, look up its value under every *distinct* filterKey
  // actually used (rather than checking each item against every
  // record), tally it once. Generalized to handle a theoretical
  // multi-filterKey items array too without regressing versus the
  // original (O(n * distinct filterKeys) instead of O(n * items.length),
  // which are equal when every item shares one filterKey and better
  // whenever items.length > distinct filterKeys).
  //
  // Memoized on [data, items] only - not activeKey - so toggling which
  // KPI card is active no longer re-scans the dataset.
  const localCountsByFilterKeyAndValue = useMemo(() => {
    if (counts) return null; // server counts provided - never scan `data` for numbers
    const filterKeys = Array.from(new Set(items.map((item) => item.filterKey).filter(Boolean)));
    const localCounts = new Map();
    data.forEach((row) => {
      filterKeys.forEach((filterKey) => {
        const value = row[filterKey];
        const mapKey = `${filterKey}::${value}`;
        localCounts.set(mapKey, (localCounts.get(mapKey) || 0) + 1);
      });
    });
    return localCounts;
  }, [counts, data, items]);

  const getCount = (item) => {
    if (counts) return counts[item.key] ?? 0;
    if (!item.filterKey) return total;
    return localCountsByFilterKeyAndValue.get(`${item.filterKey}::${item.key}`) || 0;
  };

  const handleClick = (key) => {
    if (!clickable || !onChange) return;
    onChange(activeKey === key ? null : key); // ✅ toggle
  };

  return (
    <Grid container spacing={2}>
      {items.map((item) => {
        const count = getCount(item);

        return (
          <Grid item xs={12 / items.length} key={item.key}>
            <KpiCard
              icon={item.icon}
              iconBg={item.iconBg}
              iconColor={item.iconColor}
              label={item.label}
              value={`${count} / ${total}`}
              isClickable={clickable}
              isActive={activeKey === item.key}
              onClick={() => handleClick(item.key)}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}

export default UniversalKpiRow;
