import type { Preview } from '@storybook/react-vite';
import '../src/styles.css';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Ember theme',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, context) => (
      <div
        className="ember-theme"
        data-theme={context.globals.theme === 'light' ? 'light' : 'dark'}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
};

export default preview;
