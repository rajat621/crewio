import { createTheme } from "@mui/material/styles";
import { colors } from "./colors.ts";
import { semantic } from "./semantic.ts";

export const lightTheme = createTheme({
  palette: {
    primary: {
      main: colors.blue[600],
      light: colors.blue[500],
      dark: colors.blue[700],
      contrastText: "#FFFFFF",
    },
    background: {
      default: semantic.background.canvas,
      paper: semantic.background.surface,
    },
    text: {
      primary: semantic.text.primary,
      secondary: semantic.text.secondary,
    },
    success: {
      main: colors.success[500],
      light: colors.success[200],
    },
    warning: {
      main: colors.warning[500],
      light: colors.warning[200],
    },
    error: {
      main: colors.error[500],
      light: colors.error[200],
    },
    info: {
      main: colors.info[500],
      light: colors.info[200],
    },
    divider: semantic.border.divider,
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  shape: {
    borderRadius: 8,
  },
});

export default lightTheme;
