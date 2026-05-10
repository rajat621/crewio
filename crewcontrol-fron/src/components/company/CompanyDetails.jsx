import {
  Box,
  Typography,
  Button,
  Divider,
  IconButton,
  TextField,
  InputAdornment,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";

/* ---------- KPI ITEM ---------- */
function KPI({ label, value, color }) {
  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      <Typography fontSize={12} color="#6B7280">
        {label}
      </Typography>
      <Typography fontSize={12} fontWeight={600} color={color}>
        {value.toString().padStart(2, "0")}
      </Typography>
    </Box>
  );
}

/* ---------- PAGE ---------- */
export default function CompanyDetails() {
  return (
    <Box sx={{ bgcolor: "#F5F6FB", minHeight: "100vh", p: 3 }}>
      <Box
        sx={{
          bgcolor: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #E5E7EB",
          p: 3,
          display: "grid",
          gridTemplateColumns: "2.2fr 1fr",
          gap: 3,
        }}
      >
        {/* ================= LEFT ================= */}
        <Box
          sx={{
            border: "1px solid #E5E7EB",
            borderRadius: "14px",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <Box sx={{ bgcolor: "#F7F6FF", px: 3, py: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <IconButton size="small">
                <ArrowBackIosNewIcon fontSize="small" />
              </IconButton>
              <Box>
                <Typography fontSize={22} fontWeight={600}>
                  MCC Group.
                </Typography>
                <Typography fontSize={14} color="#6B7280">
                  Aug 2025 - Aug 2026
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                mt: 3,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  bgcolor: "#1D4ED8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                }}
              >
                <GroupsOutlinedIcon />
              </Box>

              <Box sx={{ textAlign: "right" }}>
                <Typography fontSize={13} color="#6B7280">
                  Total worker assigned
                </Typography>
                <Typography fontSize={28} fontWeight={600}>
                  10
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* KPI BAR */}
          <Box
            sx={{
              px: 3,
              py: 1.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #E5E7EB",
            }}
          >
            <Box sx={{ display: "flex", gap: 3 }}>
              <KPI label="Present workers" value={3} color="#2563EB" />
              <KPI label="Absent workers" value={0} color="#DC2626" />
              <KPI label="On leave workers" value={0} color="#16A34A" />
            </Box>

            <Button
              variant="contained"
              size="small"
              sx={{
                textTransform: "none",
                borderRadius: "10px",
                px: 2,
              }}
            >
              Assignee Employee
            </Button>
          </Box>

          {/* TABLE */}
          <Box sx={{ p: 3 }}>
            <TextField
              fullWidth
              placeholder="Search for application id, name..."
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <Box
              sx={{
                mt: 2,
                border: "1px solid #E5E7EB",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "80px 1.8fr 1fr 0.8fr 1fr 60px",
                  px: 2,
                  py: 1,
                  bgcolor: "#F9FAFB",
                  fontSize: 12,
                  color: "#6B7280",
                }}
              >
                <Box>Sl no.</Box>
                <Box>Employee Name</Box>
                <Box>Trade</Box>
                <Box>Rate</Box>
                <Box>Status</Box>
                <Box>Action</Box>
              </Box>

              {[1, 2, 3, 4, 5, 6, 7].map((row) => (
                <Box
                  key={row}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "80px 1.8fr 1fr 0.8fr 1fr 60px",
                    px: 2,
                    py: 1.5,
                    borderTop: "1px solid #E5E7EB",
                    fontSize: 13,
                    alignItems: "center",
                  }}
                >
                  <Box>{row.toString().padStart(2, "0")}</Box>
                  <Box>BHUPENDRA KUMAR MANDAL</Box>
                  <Box>Carpenter</Box>
                  <Box>9.50</Box>
                  <Box>
                    <Box
                      sx={{
                        bgcolor: "#DFF3E4",
                        color: "#166534",
                        px: 2,
                        py: 0.5,
                        borderRadius: "12px",
                        width: "fit-content",
                        fontSize: 12,
                      }}
                    >
                      Valid
                    </Box>
                  </Box>
                  <IconButton size="small">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* ================= RIGHT ================= */}
        <Box
          sx={{
            border: "1px solid #E5E7EB",
            borderRadius: "14px",
            p: 3,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography fontSize={16} fontWeight={600}>
              Company Details
            </Typography>
            <Button
              size="small"
              variant="outlined"
              sx={{ textTransform: "none", borderRadius: "8px" }}
            >
              Edit
            </Button>
          </Box>

          {[
            "Company Name",
            "Tel no.",
            "PO Box",
            "Fax no.",
            "Address",
            "Tax Registration Number ( TRN )",
          ].map((label) => (
            <Box key={label} sx={{ mb: 2 }}>
              <Typography fontSize={12} color="#6B7280" mb={0.5}>
                {label}
              </Typography>
              <TextField fullWidth size="small" />
            </Box>
          ))}

          <Box
            sx={{
              mt: 2,
              bgcolor: "#F7F6FF",
              p: 2,
              borderRadius: "10px",
              fontSize: 12,
              color: "#2563EB",
              textAlign: "center",
            }}
          >
            These details are used for invoices and official documents.
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
