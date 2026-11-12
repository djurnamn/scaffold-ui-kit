import { useEffect, useRef, useState } from 'react';
import { mount as mountSvelte, unmount as unmountSvelte } from 'svelte';
import { createApp } from 'vue';
import { reactView, type PreviewView } from '@scaffold-ui-kit/preview/views';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  NumberInput,
  Radio,
  RadioGroup,
  SegmentedControl,
  Switch,
  TextInput,
} from 'mantine-style-kit-example/react';
import FormControls from './FormControls.svelte';
import FormVue from './FormVue.vue';

const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const variants = ['filled', 'light', 'outline', 'subtle'] as const;
const colors = ['blue', 'red', 'green', 'grape'] as const;
const row = {
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
  flexWrap: 'wrap',
} as const;

/** The props-driven API at a glance: every variant in every color, every size. */
function Matrix() {
  return (
    <div style={{ display: 'grid', gap: '1rem', padding: '1rem' }}>
      {variants.map((variant) => (
        <div key={variant} style={row}>
          <code style={{ width: '5rem' }}>{variant}</code>
          {colors.map((color) => (
            <Button key={color} variant={variant} color={color}>
              {color}
            </Button>
          ))}
        </div>
      ))}
      <div style={row}>
        <code style={{ width: '5rem' }}>size</code>
        {sizes.map((size) => (
          <Button key={size} size={size}>
            {size}
          </Button>
        ))}
      </div>
      <div style={row}>
        <code style={{ width: '5rem' }}>badge</code>
        {colors.map((color) => (
          <Badge key={color} color={color} variant="light">
            {color}
          </Badge>
        ))}
        <Badge variant="dot" color="green">
          online
        </Badge>
      </div>
    </div>
  );
}

/** A form whose state lives in the view: every field is controlled through its two-way prop. */
function SignupForm() {
  const [email, setEmail] = useState('');
  const [framework, setFramework] = useState('react');
  const [plan, setPlan] = useState('free');
  const [seats, setSeats] = useState<number | ''>(1);
  const [newsletter, setNewsletter] = useState(true);
  const [agree, setAgree] = useState(false);
  const [blurs, setBlurs] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  // The consumer's ref reaches the routed <input>, not the wrapper around it.
  const emailRef = useRef<HTMLInputElement>(null);
  const [refTag, setRefTag] = useState<string | null>(null);
  useEffect(() => setRefTag(emailRef.current?.tagName ?? null), []);
  const emailError =
    email && !email.includes('@') ? 'An email address has an @' : undefined;
  return (
    <form
      style={{
        display: 'grid',
        gap: '1rem',
        padding: '1rem',
        maxWidth: '24rem',
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!email) {
          emailRef.current?.focus();
          return;
        }
        setSubmitted(
          Object.fromEntries(
            [...new FormData(event.currentTarget)].map(([key, value]) => [
              key,
              String(value),
            ])
          )
        );
      }}
    >
      {!dismissed && (
        <Alert
          title="Every field here is controlled"
          withCloseButton
          onClose={() => setDismissed(true)}
        >
          The view owns the state; each component reports changes through its
          change prop.
        </Alert>
      )}
      <TextInput
        ref={emailRef}
        label="Email"
        withAsterisk
        value={email}
        onValueChange={setEmail}
        error={emailError}
        name="email"
        autoComplete="email"
      />
      <SegmentedControl
        data={[
          { label: 'React', value: 'react' },
          { label: 'Vue', value: 'vue' },
          { label: 'Svelte', value: 'svelte' },
        ]}
        value={framework}
        onChange={setFramework}
        color="grape"
        fullWidth
      />
      <RadioGroup label="Plan" value={plan} onChange={setPlan} name="plan">
        <Radio value="free" label="Free" />
        <Radio value="team" label="Team" />
      </RadioGroup>
      <NumberInput
        label="Seats"
        description="Team plan only"
        min={1}
        max={plan === 'team' ? 50 : 1}
        value={seats}
        onValueChange={setSeats}
        name="seats"
        disabled={plan !== 'team'}
      />
      <Switch
        label="Newsletter"
        checked={newsletter}
        onCheckedChange={setNewsletter}
        onLabel="yes"
        offLabel="no"
        name="newsletter"
      />
      <Checkbox
        label="I agree to the terms"
        checked={agree}
        onCheckedChange={setAgree}
        name="agree"
        required
        aria-describedby="agree-hint"
        onBlur={() => setBlurs((count) => count + 1)}
      />
      {/* The consumer's aria-describedby joins the checkbox's own ids on the <input>. */}
      <small id="agree-hint">Read the terms before you sign up.</small>
      <Button type="submit" disabled={!agree || !!emailError} fullWidth>
        Sign up as a {framework} developer
      </Button>
      <pre style={{ fontSize: '0.75rem' }}>
        {JSON.stringify(
          {
            email,
            framework,
            plan,
            seats,
            newsletter,
            agree,
            checkboxBlurs: blurs,
            emailRef: refTag,
            submitted,
          },
          null,
          2
        )}
      </pre>
    </form>
  );
}

export const views: PreviewView[] = [
  {
    id: 'matrix',
    label: 'Matrix (React)',
    order: 10,
    ...reactView(() => <Matrix />),
  },
  {
    id: 'signup',
    label: 'Controlled form (React)',
    order: 11,
    ...reactView(() => <SignupForm />),
  },
  {
    id: 'form-vue',
    label: 'Form (Vue, v-model)',
    order: 12,
    framework: 'vue',
    mount(element) {
      const app = createApp(FormVue);
      app.mount(element);
      return () => app.unmount();
    },
  },
  {
    id: 'form-controls-svelte',
    label: 'Form controls (Svelte)',
    order: 13,
    framework: 'svelte',
    mount(element) {
      const instance = mountSvelte(FormControls, { target: element });
      return () => void unmountSvelte(instance);
    },
  },
  { id: 'components', label: 'Components', order: 20, componentTree: true },
];

export const viewById = (id: string) => views.find((view) => view.id === id);
