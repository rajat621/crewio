export const componentTokens = {
  button: {
    primary: {
      defaultBg: "var(--color-primary)",
      hoverBg: "var(--color-primary-hover)",
      activeBg: "var(--color-primary-active)",
      pressedBg: "var(--color-primary-pressed)",
      focusRing: "var(--color-primary-focus)",
      text: "var(--color-primary-contrast)",
    },
    secondary: {
      border: "var(--color-primary)",
      text: "var(--color-primary)",
      hoverBg: "var(--bg-info-soft)",
      activeBg: "var(--bg-info-soft)",
    },
    disabled: {
      bg: "var(--border-card-hover)",
      text: "var(--color-primary-contrast)",
    },
    selected: {
      bg: "var(--bg-surface-tertiary)",
      text: "var(--text-primary)",
    },
  },
  card: {
    bg: "var(--bg-surface)",
    border: "var(--border-card)",
    borderHover: "var(--border-cardHover)",
    borderSelected: "var(--border-cardSelected)",
  },
  input: {
    bg: "var(--bg-surface)",
    border: "var(--border-input)",
    borderHover: "var(--border-inputHover)",
    borderFocus: "var(--border-inputFocus)",
    borderSelected: "var(--border-inputSelected)",
    disabledBg: "var(--bg-surfaceSecondary)",
  },
};

export default componentTokens;
