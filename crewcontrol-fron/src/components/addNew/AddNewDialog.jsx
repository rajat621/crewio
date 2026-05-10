import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AddNewItemCard from "./AddNewItemCard";

const ADD_OPTIONS = [
  { id: "employee", label: "Add Employee", icon: PersonAddAltOutlinedIcon },
  { id: "company", label: "Add Company", icon: BusinessOutlinedIcon },
  { id: "invoice", label: "Create Tax Invoice", icon: ReceiptLongOutlinedIcon },
  { id: "salary", label: "Create Salary Slip", icon: DescriptionOutlinedIcon, disabled: true },
];

const NEXT_ROUTE_BY_OPTION = {
  employee: "/add-employee",
  company: "/add-company",
  invoice: "/tax-invoices/generate",
};

function AddNewDialog({ open, onClose }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const handleNext = () => {
    const nextRoute = NEXT_ROUTE_BY_OPTION[selected];
    if (!nextRoute) return;

    navigate(nextRoute);
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(20,20,20,0.2)", // #141414 @ 20%
          backdropFilter: "blur(2px)",
        },
      }}
      PaperProps={{
        sx: {
          width: 650,
          height: 520,
          backgroundColor: "#FFFFFF",
          border: "1px solid #5F5F6F1A",
          borderRadius: "8px",
          boxShadow: "0px 2px 2px 0px rgba(95, 95, 111, 0.12)",
          overflow: "hidden",
        },
      }}
    >
      {/* HEADER */}
      <Box
        sx={{
          height: 64,
          borderBottom: "1px solid #5F5F6F1A",
          px: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          sx={{
            fontSize: "18px",
            fontWeight: 600,
            lineHeight: "20px",
            letterSpacing: "0.03em",
            fontFamily: '"Inter", sans-serif',
            color: "#141414",
          }}
        >
          Choose What to Add
        </Typography>

        <IconButton
          size="small"
          onClick={handleClose}
          sx={{ color: "#141414", p: 0 }}
        >
          <CloseIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Box>

      {/* CONTENT */}
      <Box
        sx={{
          flex: 1,
          px: "20px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            width: "100%",
            height: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {ADD_OPTIONS.map((item) => (
            <Box key={item.id} sx={{ width: 140, height: 160 }}>
              <AddNewItemCard
                label={item.label}
                Icon={item.icon}
                disabled={item.disabled}
                selected={selected === item.id}
                onClick={() => setSelected(item.id)}
              />
            </Box>
          ))}
        </Box>
      </Box>

      {/* FOOTER */}
      <Box
        sx={{
          height: 68,
          borderTop: "1px solid #5F5F6F1A",
          px: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <Button
          variant="contained"
          disabled={!selected}
          onClick={handleNext}
          sx={{
            width: 80,
            height: 32,
            borderRadius: "8px",
            textTransform: "none",
            fontSize: "12px",
            fontWeight: 500,
            lineHeight: "16px",
            fontFamily: '"Inter", sans-serif',
            boxShadow: "none",
          }}
        >
          Next
        </Button>
      </Box>
    </Dialog>
  );
}

export default AddNewDialog;
