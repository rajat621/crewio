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
}) {
  const total = data.length;

  const getCount = (item) => {
    if (!item.filterKey) return total;
    return data.filter(
      (row) => row[item.filterKey] === item.key
    ).length;
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
