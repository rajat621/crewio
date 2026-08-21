export const interactionStates = {
  primaryButton: {
    default: "var(--color-primary)",
    hover: "var(--color-primary-hover)",
    active: "var(--color-primary-active)",
    pressed: "var(--color-primary-pressed)",
    focus: "var(--color-primary-focus)",
    disabled: "var(--border-card-hover)",
  },
  secondaryButton: {
    border: "var(--color-primary)",
    text: "var(--color-primary)",
    hoverBg: "var(--bg-info-soft)",
    activeBg: "var(--bg-info-soft)",
  },
  input: {
    defaultBorder: "var(--border-input)",
    hoverBorder: "var(--border-input-hover)",
    focusBorder: "var(--border-input-focus)",
    selectedBorder: "var(--border-input-selected)",
    disabledBg: "var(--bg-surface-secondary)",
  },
  card: {
    defaultBorder: "var(--border-card)",
    hoverBorder: "var(--border-card-hover)",
    selectedBorder: "var(--border-cardSelected)",
  },
};

export default interactionStates;
