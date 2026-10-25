import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

export function useMotionPreference(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return true;
    return (
      localStorage.getItem('posha:reduce-motion') === 'true' ||
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    );
  });
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () =>
      setReduced(localStorage.getItem('posha:reduce-motion') === 'true' || Boolean(media?.matches));
    if (!media) return;
    media.addEventListener('change', update);
    window.addEventListener('storage', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return reduced;
}

export function PageTransition({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`page-transition${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export function Reveal({
  children,
  className = '',
  as: Element = 'div',
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  const element = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const current = element.current;
    if (!current) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(current);
    return () => observer.disconnect();
  }, []);
  return (
    <Element
      {...props}
      ref={element as never}
      className={`reveal${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </Element>
  );
}

export function PressFeedback({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} className={`press-feedback${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}
