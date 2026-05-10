import { Tab, Tabs } from "@mui/material";

const TABS = [
  { label: "Employee Detail", value: "employee-detail" },
  { label: "Assigned", value: "assigned" },
  { label: "Attendance", value: "attendance" },
  { label: "Passport Status", value: "passport" },
  { label: "Track Employee", value: "track" },
];

const EmployeesTabs = ({ value, onChange }) => {
  return (
    <Tabs
      value={value}
      onChange={(_, v) => onChange(v)}
      sx={{
        minHeight: "32px",
        height: "32px",
        "& .MuiTab-root": {
          minHeight: "32px",
          height: "32px",
          textTransform: "none",
          fontSize: "14px",
          px: 2,
        },
        "& .MuiTabs-indicator": {
          height: "2px",
        },
      }}
    >
      {TABS.map((tab) => (
        <Tab
          key={tab.value}
          value={tab.value}
          label={tab.label}
        />
      ))}
    </Tabs>
  );
};

export default EmployeesTabs;
