// import {
//   Box,
//   Typography,
//   Button,
//   TextField,
//   Divider,
// } from "@mui/material";
// import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";

// const INPUT_SX = {
//   height: 44,
//   borderRadius: "8px",
//   fontSize: 14,
//   "& .MuiInputBase-input": {
//     padding: "10px 14px",
//   },
// };

// function InvoiceDetailsStep({
//   data,
//   companyName,
//   invoiceNumber,
//   onChange,
//   onBack,
//   onGenerate,
// }) {
//   const isGenerateDisabled = !data.invoiceDate || !data.timesheetFile;

//   const handleFileChange = (file) => {
//     if (!file) return;
//     if (file.type !== "application/pdf") return;
//     if (file.size > 5 * 1024 * 1024) return;
//     onChange("timesheetFile", file);
//   };

//   return (
//     <Box sx={{ mt: "24px", display: "flex", gap: "32px" }}>
//       {/* LEFT CONTENT */}
//       <Box sx={{ flex: 1 }}>
//         {/* VAT ROW — FIXED */}
//         <Box sx={{ mt: "4px" }}>
//           <Box
//             sx={{
//               display: "flex",
//               alignItems: "center",
//               gap: "16px",
//             }}
//           >
//             {/* LABEL */}
//             <Typography
//               fontSize={14}
//               fontWeight={500}
//               whiteSpace="nowrap"
//             >
//               Value Added Tax system ( VAT )
//             </Typography>

//             {/* CONTROLS — FIXED WIDTH */}
//             <Box
//               sx={{
//                 display: "flex",
//                 alignItems: "center",
//                 gap: "8px",
//                 flexShrink: 0,
//               }}
//             >
//               <Button
//                 variant="outlined"
//                 size="small"
//                 onClick={() =>
//                   onChange("vat", Math.max(data.vat - 1, 0))
//                 }
//                 sx={{
//                   minWidth: 32,
//                   height: 32,
//                   borderRadius: "8px",
//                   borderColor: "var(--color-primary)",
//                   color: "var(--color-primary)",
//                 }}
//               >
//                 –
//               </Button>

//               <Typography fontSize={14} fontWeight={600}>
//                 {String(data.vat).padStart(2, "0")}
//               </Typography>

//               <Button
//                 variant="outlined"
//                 size="small"
//                 onClick={() => onChange("vat", data.vat + 1)}
//                 sx={{
//                   minWidth: 32,
//                   height: 32,
//                   borderRadius: "8px",
//                   borderColor: "var(--color-primary)",
//                   color: "var(--color-primary)",
//                 }}
//               >
//                 +
//               </Button>
//             </Box>
//           </Box>
//         </Box>
   
//       {/* DIVIDER — ONLY THIS GROWS */}
//             <Box sx={{ flex: 1 }}>
//               <Divider />
//             </Box>

//         {/* INVOICE DATE */}
//         <Box sx={{ mt: "24px", width: 580 }}>
//           <Typography
//             fontSize={14}
//             fontWeight={500}
//             sx={{ mb: "4px" }}
//           >
//             Invoice Date
//           </Typography>

//           <TextField
//             type="date"
//             fullWidth
//             value={data.invoiceDate}
//             onChange={(e) =>
//               onChange("invoiceDate", e.target.value)
//             }
//             sx={INPUT_SX}
//           />
//         </Box>

//         {/* UPLOAD TIMESHEET */}
//         <Box sx={{ mt: "24px" }}>
//           <Typography
//             fontSize={14}
//             fontWeight={500}
//             sx={{ mb: "8px" }}
//           >
//             Upload Timesheet
//           </Typography>

//           <Box
//             sx={{
//               border: "1px dashed var(--border-input-hover)",
//               borderRadius: "12px",
//               height: 300,
//               display: "flex",
//               flexDirection: "column",
//               alignItems: "center",
//               justifyContent: "center",
//               gap: "10px",
//               textAlign: "center",
//             }}
//           >
//             <CloudUploadOutlinedIcon
//               sx={{ fontSize: 56, color: "var(--text-disabled)" }}
//             />

//             <Typography fontSize={14} color="var(--text-secondary)">
//               Drag & drop the timesheet here
//             </Typography>

//             <Typography fontSize={12} color="var(--text-disabled)">
//               Accepted formats: PDF (Max 5MB)
//             </Typography>

//             <Typography fontSize={12} color="var(--text-disabled)">
//               – OR –
//             </Typography>

//             <Button
//               variant="contained"
//               component="label"
//               sx={{
//                 mt: "4px",
//                 px: "24px",
//                 height: 36,
//                 borderRadius: "8px",
//                 textTransform: "uppercase",
//                 boxShadow:
//                   "0px 4px 10px var(--shadow-floating)",
//               }}
//             >
//               Browse
//               <input
//                 type="file"
//                 hidden
//                 accept="application/pdf"
//                 onChange={(e) =>
//                   handleFileChange(e.target.files?.[0])
//                 }
//               />
//             </Button>

//             {data.timesheetFile && (
//               <Typography fontSize={12} sx={{ mt: "8px" }}>
//                 {data.timesheetFile.name}
//               </Typography>
//             )}
//           </Box>
//         </Box>

//         {/* ACTIONS */}
//         <Box
//           sx={{
//             mt: "48px",
//             display: "flex",
//             justifyContent: "space-between",
//             alignItems: "center",
//           }}
//         >
//           <Button
//             variant="text"
//             onClick={onBack}
//             sx={{
//               textTransform: "none",
//               fontSize: 14,
//               fontWeight: 500,
//             }}
//           >
//             Back
//           </Button>

//           <Button
//             variant="contained"
//             disabled={isGenerateDisabled}
//             onClick={onGenerate}
//             sx={{
//               height: 36,
//               px: "28px",
//               borderRadius: "10px",
//               textTransform: "none",
//               fontSize: 14,
//               fontWeight: 600,
//               boxShadow: "none",
//             }}
//           >
//             Generate
//           </Button>
//         </Box>
//       </Box>

//       {/* RIGHT KPI CARDS */}
//       <Box
//         sx={{
//           width: 260,
//           display: "flex",
//           flexDirection: "column",
//           gap: "20px",
//         }}
//       >
//         <Box
//           sx={{
//             border: "1px solid var(--border-input)",
//             borderRadius: "14px",
//             p: "20px",
//           }}
//         >
//           <Typography fontSize={12} color="var(--text-disabled)">
//             Company Name
//           </Typography>
//           <Typography
//             fontSize={26}
//             fontWeight={700}
//             sx={{ mt: "4px" }}
//           >
//             {companyName}
//           </Typography>
//         </Box>

//         <Box
//           sx={{
//             border: "1px solid var(--border-input)",
//             borderRadius: "14px",
//             p: "20px",
//           }}
//         >
//           <Typography fontSize={12} color="var(--text-disabled)">
//             Invoice No.
//           </Typography>
//           <Typography
//             fontSize={26}
//             fontWeight={700}
//             sx={{ mt: "4px" }}
//           >
//             {invoiceNumber}
//           </Typography>
//         </Box>
//       </Box>
//     </Box>
//   );
// }

// export default InvoiceDetailsStep;
import {
  Box,
  Typography,
  Button,
  TextField,
  Divider,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";

const INPUT_SX = {
  height: 44,
  borderRadius: "8px",
  fontSize: 14,
  "& .MuiInputBase-input": {
    padding: "10px 14px",
  },
};

function InvoiceDetailsStep({
  data,
  companyName,
  invoiceNumber,
  onChange,
  onBack,
  onGenerate,
}) {
  const isGenerateDisabled = !data.invoiceDate || !data.timesheetFile;

  const handleFileChange = (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") return;
    if (file.size > 5 * 1024 * 1024) return;
    onChange("timesheetFile", file);
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: "32px",
        position: "relative", // anchor for KPI cards
      }}
    >
      {/* LEFT COLUMN — HARD WIDTH */}
      <Box sx={{ width: 580, mt: "24px" }}>
        {/* VAT ROW */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography fontSize={14} fontWeight={500}>
            Value Added Tax system ( VAT )
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() =>
                onChange("vat", Math.max(data.vat - 1, 0))
              }
              sx={{
                minWidth: 32,
                height: 32,
                borderRadius: "8px",
                borderColor: "var(--color-primary)",
                color: "var(--color-primary)",
              }}
            >
              –
            </Button>

            <Typography fontSize={14} fontWeight={600}>
              {String(data.vat).padStart(2, "0")}
            </Typography>

            <Button
              variant="outlined"
              size="small"
              onClick={() => onChange("vat", data.vat + 1)}
              sx={{
                minWidth: 32,
                height: 32,
                borderRadius: "8px",
                borderColor: "var(--color-primary)",
                color: "var(--color-primary)",
              }}
            >
              +
            </Button>
          </Box>
        </Box>

        <Divider sx={{ my: "20px" }} />

        {/* INVOICE DATE */}
        <Box sx={{ mt: "20px" }}>
          <Typography fontSize={14} fontWeight={500} sx={{ mb: "4px" }}>
            Invoice Date
          </Typography>

          <TextField
            type="date"
            fullWidth
            value={data.invoiceDate}
            onChange={(e) =>
              onChange("invoiceDate", e.target.value)
            }
            sx={INPUT_SX}
          />
        </Box>

        {/* UPLOAD TIMESHEET */}
        <Box sx={{ mt: "24px" }}>
          <Typography fontSize={14} fontWeight={500} sx={{ mb: "8px" }}>
            Upload Timesheet
          </Typography>

          <Box
            sx={{
              border: "1px dashed var(--border-input-hover)",
              borderRadius: "12px",
              height: 300,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              textAlign: "center",
            }}
          >
            <CloudUploadOutlinedIcon
              sx={{ fontSize: 56, color: "var(--text-disabled)" }}
            />

            <Typography fontSize={14} color="var(--text-secondary)">
              Drag & drop the timesheet here
            </Typography>

            <Typography fontSize={12} color="var(--text-disabled)">
              Accepted formats: PDF (Max 5MB)
            </Typography>

            <Typography fontSize={12} color="var(--text-disabled)">
              – OR –
            </Typography>

            <Button
              variant="contained"
              component="label"
              sx={{
                mt: "4px",
                px: "24px",
                height: 36,
                borderRadius: "8px",
                textTransform: "uppercase",
                boxShadow:
                  "0px 4px 10px var(--shadow-floating)",
              }}
            >
              Browse
              <input
                type="file"
                hidden
                accept="application/pdf"
                onChange={(e) =>
                  handleFileChange(e.target.files?.[0])
                }
              />
            </Button>

            {data.timesheetFile && (
              <Typography fontSize={12} sx={{ mt: "8px" }}>
                {data.timesheetFile.name}
              </Typography>
            )}
          </Box>
        </Box>

        {/* ACTIONS */}
        <Box
          sx={{
            mt: "48px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Button
            variant="text"
            onClick={onBack}
            sx={{ textTransform: "none", fontSize: 14, fontWeight: 500 }}
          >
            Back
          </Button>

          <Button
            variant="contained"
            disabled={isGenerateDisabled}
            onClick={onGenerate}
            sx={{
              height: 36,
              px: "28px",
              borderRadius: "10px",
              textTransform: "none",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "none",
            }}
          >
            Generate
          </Button>
        </Box>
      </Box>

      {/* RIGHT KPI CARDS — EXACT 32px FROM TOP */}
      <Box
        sx={{
          position: "absolute",
          top: 32,
          right: 24,
          width: 260,
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <Box
          sx={{
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-surface-secondary)",
            borderRadius: "14px",
            p: "20px",
          }}
        >
          <Typography fontSize={12} color="var(--text-disabled)">
            Company Name
          </Typography>
          <Typography fontSize={26} fontWeight={700} sx={{ mt: "4px" }}>
            {companyName}
          </Typography>
        </Box>

        <Box
          sx={{
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-surface-secondary)",
            borderRadius: "14px",
            p: "20px",
          }}
        >
          <Typography fontSize={12} color="var(--text-disabled)">
            Invoice No.
          </Typography>
          <Typography fontSize={26} fontWeight={700} sx={{ mt: "4px" }}>
            {invoiceNumber}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default InvoiceDetailsStep;

