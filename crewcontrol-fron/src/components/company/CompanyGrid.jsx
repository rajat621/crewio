import { Grid } from "@mui/material";
import CompanyCard from "./CompanyCard";

function CompanyGrid({ companies, onDeactivateCompany, onAssignEmployees }) {
  return (
    <Grid container spacing={2}>
      {companies.map((company) => (
        <Grid key={company.id} item xs={4}>
          <CompanyCard
            company={{
              ...company,
              onDeactivate: onDeactivateCompany,
              onAssignEmployees,
            }}
          />
        </Grid>
      ))}
    </Grid>
  );
}

export default CompanyGrid;
