import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Select,
  Spinner,
  Switch,
  TextArea,
} from './primitives.js';

const meta = { title: 'Ember/Primitives', component: Button, tags: ['autodocs'] } satisfies Meta<
  typeof Button
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <Button>Start chatting</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Leave session</Button>
      <Button loading>Saving</Button>
      <Button disabled>Unavailable</Button>
      <IconButton aria-label="Close">×</IconButton>
    </div>
  ),
};

export const FormControls: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 20, maxWidth: 380 }}>
      <Input
        label="Email address"
        type="email"
        placeholder="name@example.com"
        hint="Used for account updates."
      />
      <Input label="Display name" error="Choose a name between 3 and 24 characters." />
      <TextArea label="About you" hint="Keep personal contact details private." />
      <Select
        label="Language"
        options={[
          { value: 'en', label: 'English' },
          { value: 'sw', label: 'Kiswahili' },
        ]}
      />
      <Checkbox label="I agree to the safety rules" />
      <Switch label="Show online status" defaultChecked />
      <Chip selected>Music</Chip>
    </div>
  ),
};

export const StatusAndStates: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name="Test Creator" status="online" />
        <Badge variant="verified">Verified</Badge>
        <Badge variant="live">Live now</Badge>
        <Badge variant="adult">18+</Badge>
        <Spinner />
      </div>
      <Divider />
      <EmptyState title="No rooms right now">Try again soon to see upcoming live rooms.</EmptyState>
      <ErrorState title="Could not load rooms" action={<Button>Try again</Button>}>
        Check your connection and retry.
      </ErrorState>
    </div>
  ),
};
