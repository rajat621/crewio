import { createTheme } from "@mui/material/styles";
import { colors } from "./colors.ts";

export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: colors.blue[400],
      light: colors.blue[300],
      dark: colors.blue[500],
      contrastText: "#FFFFFF",
    },
    background: {
      default: colors.gray[900],
      paper: colors.gray[800],
    },
    text: {
      primary: colors.gray[50],
      secondary: colors.gray[300],
    },
    divider: colors.gray[700],
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  shape: {
    borderRadius: 8,
  },
});

export default darkTheme;
