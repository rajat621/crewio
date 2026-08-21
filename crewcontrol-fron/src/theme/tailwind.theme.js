import { colors } from "./colors.ts";
import { semantic } from "./semantic.ts";

export default {
  colors: {
    primary: colors.blue[600],
    secondary: semantic.text.secondary,
    surface: semantic.background.surface,
    canvas: semantic.background.canvas,
    success: colors.success[500],
    warning: colors.warning[500],
    error: colors.error[500],
    info: colors.info[500],
    input: semantic.border.input,
    card: semantic.border.card,
    selected: semantic.border.selected,
  },
};
