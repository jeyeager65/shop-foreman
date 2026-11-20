import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background: '#111318',
          surface: '#1a1d24',
          primary: '#7fb0ff',
          secondary: '#9aa3b2',
          warning: '#f0a45d',
          success: '#7ddc9a',
          error: '#ff7b72',
        },
      },
    },
  },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  defaults: {
    VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VCard: { variant: 'flat', rounded: 'lg', border: 'sm' },
    VBtn: { rounded: 'lg' },
  },
});
