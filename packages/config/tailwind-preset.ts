import emberColors from './src/tokens.json' with { type: 'json' };

const tailwindPreset = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        maroon: {
          950: emberColors['maroon-950'],
          900: emberColors['maroon-900'],
          700: emberColors['maroon-700'],
          600: emberColors['maroon-600'],
        },
        red: {
          600: emberColors['red-600'],
          500: emberColors['red-500'],
        },
        pink: {
          500: emberColors['pink-500'],
          300: emberColors['pink-300'],
          100: emberColors['pink-100'],
        },
        peach: {
          400: emberColors['peach-400'],
          200: emberColors['peach-200'],
          100: emberColors['peach-100'],
        },
        cream: { 50: emberColors['cream-50'] },
        ink: {
          900: emberColors['ink-900'],
          600: emberColors['ink-600'],
        },
        success: emberColors.success,
        warning: emberColors.warning,
        danger: emberColors.danger,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '38px', fontWeight: '700' }],
        h1: ['26px', { lineHeight: '32px', fontWeight: '700' }],
        h2: ['20px', { lineHeight: '26px', fontWeight: '650' }],
        h3: ['17px', { lineHeight: '24px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        small: ['14px', { lineHeight: '20px' }],
        caption: ['12px', { lineHeight: '16px' }],
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
        sheet: '28px',
      },
      boxShadow: {
        card: '0 8px 24px -8px rgba(63,11,27,.25)',
        glow: '0 0 0 4px rgba(240,83,127,.25)',
      },
      backgroundImage: { ember: emberColors['gradient-ember'] },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
};

export default tailwindPreset;
