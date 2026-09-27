/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        ui: ['Tajawal', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
        doc: ['Amiri', 'Traditional Arabic', 'Times New Roman', 'serif']
      },
      colors: {
        brand: {
          50: '#eef5fd',
          100: '#d8e8fa',
          200: '#b4d1f4',
          300: '#84b2e9',
          400: '#568fd8',
          500: '#3670c0',
          600: '#2857a1',
          700: '#204583',
          800: '#1d3a6a',
          900: '#1b3157'
        },
        /** ألوان ثانوية للتمييز البصري بين الوحدات */
        accent: {
          amber: '#d97706',
          emerald: '#059669',
          rose: '#e11d48',
          violet: '#7c3aed'
        }
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.04)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.12)',
        toolbar: '0 2px 10px -4px rgb(15 23 42 / 0.25)'
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } }
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out'
      }
    }
  },
  plugins: []
}
