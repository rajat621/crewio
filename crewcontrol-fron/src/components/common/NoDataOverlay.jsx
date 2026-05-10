import { Box, Button, Typography } from "@mui/material";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";

function NoDataOverlay({ title, description, actionLabel, onCancel, onAction }) {
  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        minHeight: "calc(100vh - 72px)",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(20, 20, 20, 0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: "24px",
        }}
      >
        <Box
          sx={{
            width: 418,
            height: 310,
            backgroundColor: "#FFFFFF",
            border: "1px solid rgba(95, 95, 111, 0.50)",
            borderRadius: "12px",
            boxShadow: "0px 10px 28px rgba(0, 0, 0, 0.04)",
            pt: "40px",
            px: "32px",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              mx: "auto",
              mb: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MoveToInboxOutlinedIcon sx={{ fontSize: 40, color: "#8A8A8A" }} />
          </Box>

          <Typography
            sx={{
              fontSize: "18px",
              lineHeight: "24px",
              fontWeight: 600,
              color: "#141414",
              mb: "12px",
            }}
          >
            {title}
          </Typography>

          <Typography
            sx={{
              fontSize: "14px",
              lineHeight: "20px",
              fontWeight: 400,
              color: "#757575",
              maxWidth: 354,
              mx: "auto",
              mb: "32px",
            }}
          >
            {description}
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "center", gap: "16px" }}>
            <Button
              variant="outlined"
              onClick={onCancel}
              sx={{
                minWidth: 108,
                height: 32,
                textTransform: "none",
                borderRadius: "8px",
                borderColor: "#2C5FEA",
                color: "#2C5FEA",
                fontSize: 14,
                fontWeight: 500,
                "&:hover": {
                  borderColor: "#1D4ED8",
                  backgroundColor: "#EFF4FF",
                },
              }}
            >
              Cancel
            </Button>

            <Button
              variant="contained"
              onClick={onAction}
              sx={{
                minWidth: 178,
                height: 32,
                textTransform: "none",
                borderRadius: "8px",
                backgroundColor: "#2C5FEA",
                fontSize: 14,
                fontWeight: 500,
                "&:hover": {
                  backgroundColor: "#1D4ED8",
                },
              }}
            >
              {actionLabel}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default NoDataOverlay;
