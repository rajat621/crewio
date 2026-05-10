import { Grid } from "@mui/material";
import KpiCard from "./KpiCard";

import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PersonPinCircleOutlinedIcon from "@mui/icons-material/PersonPinCircleOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";

function KpiGrid() {
  return (
    <>
      <Grid item xs={3}>
        <KpiCard
          icon={<GroupsOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="#E3E9FA"
          iconColor="#1D4ED8"
          label="Total Workers"
          value="20"
        />
      </Grid>

      <Grid item xs={3}>
        <KpiCard
          icon={<PersonPinCircleOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          label="Workers On-Site"
          value="15"
        />
      </Grid>

      <Grid item xs={3}>
        <KpiCard
          icon={<PersonOffOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          label="Absent"
          value="05"
        />
      </Grid>

      <Grid item xs={3}>
        <KpiCard
          icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="#FCE7F3"
          iconColor="#EC4899"
          label="Total Revenue"
          value="0.00"
        />
      </Grid>
    </>
  );
}

export default KpiGrid;
