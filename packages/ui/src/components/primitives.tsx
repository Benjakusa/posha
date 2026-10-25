// packages/ui/src/components/primitives.tsx
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef, useId } from 'react';
import { Check, Sparkle, X } from '../icons.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <span className="posha-spinner" role="status" aria-label={label} />
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className = '',
    disabled,
    icon,
    iconRight,
    loading = false,
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  return (
    <>
      <button
        {...props}
        ref={ref}
        className={`posha-button posha-button--${variant}${className ? ` ${className}` : ''}`}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {loading ? <span className="posha-spinner" aria-hidden="true" /> : (icon ?? null)}
        {children}
        {iconRight ?? null}
      </button>
      {loading ? (
        <span className="posha-sr-only" role="status">
          Loading
        </span>
      ) : null}
    </>
  );
});

export interface IconButtonProps extends ButtonProps {
  'aria-label': string;
}

export function IconButton({ children, className = '', ...props }: IconButtonProps) {
  return (
    <Button {...props} className={`posha-icon-button${className ? ` ${className}` : ''}`}>
      {children}
    </Button>
  );
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, FieldProps>(function Input(
  { className = '', error, hint, id, label, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const description = error ?? hint;
  return (
    <div className="posha-field">
      <label className="posha-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...props}
        ref={ref}
        id={inputId}
        className={`posha-input${error ? ' posha-input--error' : ''}${className ? ` ${className}` : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? descriptionId : props['aria-describedby']}
      />
      {description ? (
        <span className={error ? 'posha-field-error' : 'posha-field-hint'} id={descriptionId}>
          {description}
        </span>
      ) : null}
    </div>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className = '', error, hint, id, label, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const description = error ?? hint;
  return (
    <div className="posha-field">
      <label className="posha-label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        {...props}
        ref={ref}
        id={inputId}
        className={`posha-input posha-textarea${error ? ' posha-input--error' : ''}${className ? ` ${className}` : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? descriptionId : props['aria-describedby']}
      />
      {description ? (
        <span className={error ? 'posha-field-error' : 'posha-field-hint'} id={descriptionId}>
          {description}
        </span>
      ) : null}
    </div>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export function Checkbox({ description, id, label, ...props }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const descriptionId = `${checkboxId}-description`;
  return (
    <div className="posha-choice">
      <input
        {...props}
        id={checkboxId}
        type="checkbox"
        aria-describedby={description ? descriptionId : undefined}
      />
      <div>
        <label className="posha-label" htmlFor={checkboxId}>
          {label}
        </label>
        {description ? (
          <span className="posha-field-hint" id={descriptionId}>
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
}

export function Select({ error, hint, id, label, options, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const descriptionId = `${selectId}-description`;
  const description = error ?? hint;
  return (
    <div className="posha-field">
      <label className="posha-label" htmlFor={selectId}>
        {label}
      </label>
      <select
        {...props}
        id={selectId}
        className={`posha-input posha-select${error ? ' posha-input--error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? descriptionId : props['aria-describedby']}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? (
        <span className={error ? 'posha-field-error' : 'posha-field-hint'} id={descriptionId}>
          {description}
        </span>
      ) : null}
    </div>
  );
}

export function Switch({ id, label, ...props }: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  return (
    <div className="posha-choice">
      <input {...props} className="posha-switch" id={switchId} type="checkbox" role="switch" />
      <label className="posha-label" htmlFor={switchId}>
        {label}
      </label>
    </div>
  );
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({ children, className = '', selected = false, ...props }: ChipProps) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`posha-chip${selected ? ' posha-chip--selected' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}

export type BadgeVariant = 'verified' | 'live' | 'adult' | 'neutral';

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  const showLiveDot = variant === 'live';
  return (
    <span className={`posha-badge posha-badge--${variant}`}>
      {variant === 'verified' ? <Check width={12} height={12} /> : null}
      {showLiveDot ? <span className="posha-badge__dot" aria-hidden="true" /> : null}
      {variant === 'adult' ? <span aria-hidden="true">18+</span> : null}
      {children}
    </span>
  );
}

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  status?: 'online' | 'offline';
}

export function Avatar({ name, size = 'md', src, status }: AvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={`posha-avatar posha-avatar--${size}`}
      role="img"
      aria-label={`${name}${status ? `, ${status}` : ''}`}
    >
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{initials || '?'}</span>}
      {status ? (
        <span className={`posha-avatar-status posha-avatar-status--${status}`} aria-hidden="true" />
      ) : null}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="posha-state" aria-labelledby={titleId}>
      <Sparkle width={22} height={22} aria-hidden="true" />
      <h2 id={titleId}>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </section>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  children,
  action,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="posha-state posha-state--error" role="alert">
      <span className="posha-state__icon" aria-hidden="true">
        <X width={18} height={18} />
      </span>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </section>
  );
}

export const Divider = ({
  label,
  ...props
}: HTMLAttributes<HTMLHRElement> & { label?: string }) => (
  <hr
    {...props}
    className={`posha-divider${props.className ? ` ${props.className}` : ''}`}
    aria-label={label}
  />
);
