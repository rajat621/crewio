/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        surface: "var(--bg-surface)",
        canvas: "var(--bg-canvas)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
        info: "var(--color-info)",
        input: "var(--border-input)",
        card: "var(--border-card)",
        selected: "var(--border-card-selected)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
      },
      borderColor: {
        input: "var(--border-input)",
        card: "var(--border-card)",
        selected: "var(--border-card-selected)",
      },
      backgroundColor: {
        surface: "var(--bg-surface)",
        canvas: "var(--bg-canvas)",
      },
      textColor: {
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
      },
    },
  },
  plugins: [],
};
