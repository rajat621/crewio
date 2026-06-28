import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";

const routesConfig = [
  {
    path: "/",
    label: "Home",
    title: "Home",
    icon: HomeOutlinedIcon,
    topbar: {
      showSearch: true,
      showAddNew: true,
    },
  },
  {
    path: "/employees",
    label: "Employee",
    title: "Employee",
    icon: PersonOutlineIcon,
    topbar: {
      showSearch: false,
      showAddNew: false,
    },
  },
  {
    path: "/company",
    label: "Company",
    title: "Companies",
    icon: BusinessOutlinedIcon,
    topbar: {
      showSearch: false,
      showAddNew: false,
    },
  },
  {
    path: "/tax-invoices", // ✅ FIXED (THIS WAS THE BUG)
    label: "Tax Invoices",
    title: "Tax Invoices",
    icon: ReceiptLongOutlinedIcon,
    topbar: {
      showSearch: false,
      showAddNew: false,
    },
  },
    {
    path: "/salary-slip",
    label: "Salary Slip",
    title: "Salary Slip",
    icon: PaidOutlinedIcon,
    topbar: {
      showSearch: false,
      showAddNew: false,
    },
  },
  {
    path: "/expenses",
    label: "Expenses",
    title: "Expenses",
    icon: RequestQuoteOutlinedIcon,
    topbar: {
      showSearch: false,
      showAddNew: false,
    },
  },
  {
    path: "/finance",
    label: "Finance",
    title: "Finance",
    icon: CategoryOutlinedIcon,
    comingSoon: true,
    topbar: {
      showSearch: false,
      showAddNew: false,
    },
  },
  
];

export default routesConfig;
