import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1D4ED8", // primary blue used across app
    },
    background: {
      default: "#F6F7FB", // app background
    },
    text: {
      primary: "#141414",
      secondary: "#757575",
    },
  },
  typography: {
    fontFamily: "sans-serif",
  },
  shape: {
    borderRadius: 8,
  },
});

export default theme;
