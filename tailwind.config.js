/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        ocean: {
          50: 'rgb(var(--ocean-50) / <alpha-value>)',
          100: 'rgb(var(--ocean-100) / <alpha-value>)',
          200: 'rgb(var(--ocean-200) / <alpha-value>)',
          500: 'rgb(var(--ocean-500) / <alpha-value>)',
          600: 'rgb(var(--ocean-600) / <alpha-value>)',
          700: 'rgb(var(--ocean-700) / <alpha-value>)',
          900: 'rgb(var(--ocean-900) / <alpha-value>)',
        },
        marigold: {
          50: 'rgb(var(--marigold-50) / <alpha-value>)',
          100: 'rgb(var(--marigold-100) / <alpha-value>)',
          200: 'rgb(var(--marigold-200) / <alpha-value>)',
          500: 'rgb(var(--marigold-500) / <alpha-value>)',
          600: 'rgb(var(--marigold-600) / <alpha-value>)',
          700: 'rgb(var(--marigold-700) / <alpha-value>)',
          900: 'rgb(var(--marigold-900) / <alpha-value>)',
        },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surfaceAlt: 'rgb(var(--surface-alt) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        inkMuted: 'rgb(var(--ink-muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
