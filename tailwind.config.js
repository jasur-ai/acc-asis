/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#090B10',
          900: '#0E1118',
          850: '#131722',
          800: '#181D2B',
          700: '#21283B',
          600: '#2D364F',
        },
        tg: {
          blue: '#2AABEE',
          darkBlue: '#229ED9',
          glow: 'rgba(42, 171, 238, 0.16)',
        },
        violet: {
          accent: '#8B5CF6',
          deep: '#6D28D9',
          glow: 'rgba(139, 92, 246, 0.18)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
