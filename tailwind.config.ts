import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14181C",
        surface: "#1C2228",
        raised: "#242B32",
        line: "#2C343B",
        paper: "#E7E2D6",
        muted: "#8B939B",
        accent: "#D9A441",
        accentDim: "#8A6B2E",
        sage: "#6B8F71",
        rust: "#B5544A",
      },
      fontFamily: {
        display: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
