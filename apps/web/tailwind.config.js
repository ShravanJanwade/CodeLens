/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core dark palette — professional developer tool aesthetic
        surface: {
          0: '#08090a', // Deepest background
          1: '#0b0c0e', // Page background
          2: '#111214', // Card background
          3: '#16171a', // Elevated surface
          4: '#1c1d21', // Hover state
          5: '#24252a', // Active state
        },
        border: {
          DEFAULT: '#232428',
          subtle: '#1a1b1e',
          strong: '#2f3136',
          accent: '#4493f820',
        },
        accent: {
          DEFAULT: '#2f6feb',
          hover: '#1f5fd6',
          muted: '#4493f820',
          text: '#7cb3ff',
        },
        // Status colors — restrained, not cartoonish
        status: {
          healthy: '#3fb950',
          warning: '#d29922',
          critical: '#f85149',
          investigating: '#4493f8',
          info: '#4493f8',
        },
        // Severity badge colors
        severity: {
          critical: { bg: '#ef44441a', text: '#fca5a5', border: '#ef444440' },
          high: { bg: '#f973161a', text: '#fdba74', border: '#f9731640' },
          medium: { bg: '#eab3081a', text: '#fde047', border: '#eab30840' },
          low: { bg: '#22c55e1a', text: '#86efac', border: '#22c55e40' },
        },
        text: {
          primary: '#ededef',
          secondary: '#a9aab1',
          tertiary: '#7d7f87',
          muted: '#7d7f87',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        shimmer: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
      },
    },
  },
  plugins: [],
};
