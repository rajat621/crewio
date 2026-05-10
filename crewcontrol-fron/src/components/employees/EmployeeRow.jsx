// import {
//   IconButton,
//   TableCell,
//   TableRow,
//   Typography,
// } from "@mui/material";
// import MoreVertIcon from "@mui/icons-material/MoreVert";

// const EmployeeRow = ({ employee }) => {
//   const {
//     employeeId,
//     name,
//     phone,
//     trade,
//     hourlyRate,
//     joiningDate,
//   } = employee;

//   return (
//     <TableRow
//       sx={{
//         height: "44px",
//       }}
//     >
//       <TableCell
//         sx={{
//           fontSize: "12px",
//           color: "text.secondary",
//           py: 0,
//           borderBottom: "1px solid",
//           borderColor: "divider",
//           whiteSpace: "nowrap",
//         }}
//       >
//         {employeeId}
//       </TableCell>

//       <TableCell
//         sx={{
//           fontSize: "12px",
//           color: "text.primary",
//           py: 0,
//           borderBottom: "1px solid",
//           borderColor: "divider",
//         }}
//       >
//         {name}
//       </TableCell>

//       <TableCell sx={{ fontSize: "12px", py: 0 }}>
//         {phone}
//       </TableCell>

//       <TableCell sx={{ fontSize: "12px", py: 0 }}>
//         {trade}
//       </TableCell>

//       <TableCell sx={{ fontSize: "12px", py: 0 }}>
//         {hourlyRate.toFixed(2)}
//       </TableCell>

//       <TableCell sx={{ fontSize: "12px", py: 0 }}>
//         {new Date(joiningDate).toLocaleDateString("en-GB", {
//           day: "2-digit",
//           month: "short",
//           year: "numeric",
//         })}
//       </TableCell>

//       {/* ✅ FIXED Action column */}
//       <TableCell
//         align="right"
//         sx={{
//           width: 56,              // 🔒 lock column width
//           py: 0,
//           borderBottom: "1px solid",
//           borderColor: "divider",
//         }}
//       >
//         <IconButton
//           size="small"
//           sx={{
//             p: "4px",             // 🔧 reduce extra whitespace
//           }}
//         >
//           <MoreVertIcon fontSize="small" />
//         </IconButton>
//       </TableCell>
//     </TableRow>
//   );
// };

// export default EmployeeRow;
import { TableRow, TableCell } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { EmployeeActionMenu } from "../profile/EmployeeActionMenu";
import { CELL_SX } from "../table/tableUtils";
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';

export default function EmployeeRow({ row }) {
  const navigate = useNavigate();

  // Define actions for the 3-dot menu
  const actions = [
    {
      id: 'view',
      label: 'View Profile',
      icon: <VisibilityOutlinedIcon fontSize="small" />,
      onClick: () => navigate(`/employees/${row.id}`),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: <EditOutlinedIcon fontSize="small" />,
      onClick: () => navigate(`/employees/${row.id}?edit=true`),
    },
    {
      id: 'assign',
      label: 'Assign',
      icon: <AssignmentOutlinedIcon fontSize="small" />,
      onClick: () => console.log('Assign', row.id),
    },
    {
      id: 'invoice',
      label: 'Generate Invoice',
      icon: <DescriptionOutlinedIcon fontSize="small" />,
      onClick: () => navigate(`/tax-invoices/generate?employeeId=${row.id}`),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <DeleteOutlineOutlinedIcon fontSize="small" />,
      onClick: () => {
        if (window.confirm(`Are you sure you want to delete ${row.name}?`)) {
          console.log('Delete', row.id);
        }
      },
      isDanger: true,
    },
  ];

  return (
    <TableRow sx={{ height: 44 }}>
      <TableCell sx={CELL_SX}>{row.id}</TableCell>
      <TableCell sx={CELL_SX}>{row.name}</TableCell>
      <TableCell sx={CELL_SX}>{row.phone}</TableCell>
      <TableCell sx={CELL_SX}>{row.trade}</TableCell>
      <TableCell sx={CELL_SX}>{row.rate}</TableCell>
      <TableCell sx={CELL_SX}>{row.joined}</TableCell>

      <TableCell align="center" sx={CELL_SX}>
        <EmployeeActionMenu actions={actions} employeeId={row.id} />
      </TableCell>
    </TableRow>
  );
}
