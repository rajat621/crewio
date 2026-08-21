import { colors } from "./colors.ts";

export const semantic = {
  text: {
    primary: colors.gray[700],
    secondary: colors.gray[600],
    tertiary: colors.gray[500],
    placeholder: colors.gray[500],
    disabled: colors.gray[400],
    inverse: colors.gray[50],
  },
  background: {
    canvas: colors.gray[100],
    surface: colors.gray[50],
    surfaceSecondary: colors.gray[100],
    surfaceTertiary: "#EAE7F3",
    elevated: colors.gray[50],
    card: colors.gray[50],
    table: colors.gray[50],
    inputHover: colors.gray[100],
    inputActive: colors.gray[50],
    inputSelected: "#EAE7F3",
    inputDisabled: colors.gray[100],
  },
  border: {
    card: "#EAE7F3",
    cardHover: colors.gray[300],
    cardSelected: colors.blue[600],
    table: "#EAE7F3",
    tableRow: "#EAE7F3",
    input: "#EAE7F3",
    inputHover: colors.gray[300],
    inputFocus: colors.gray[600],
    inputSelected: colors.blue[600],
    inputDisabled: "#EAE7F3",
    divider: "#EAE7F3",
    separator: colors.gray[300],
    modal: colors.gray[300],
    dropdown: colors.gray[300],
    selected: colors.gray[600],
    disabled: "#EAE7F3",
  },
};

export default semantic;
