import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import { Icon } from "../art/icons.js";
import type { IconName } from "../art/iconArt.js";
import { useReducedMotion } from "./app-state.js";

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "default" | "hot" | "dark" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={classNames(
        "sfc-btn",
        variant === "hot" && "sfc-btn--hot",
        variant === "dark" && "sfc-btn--dark",
        variant === "ghost" && "sfc-btn--ghost",
        size === "sm" && "sfc-btn--sm",
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} className="sfc-btn__icon" /> : null}
      {children}
    </button>
  );
}

export type PillTone = "default" | "open" | "locked" | "live" | "final" | "upset" | "bye" | "walkover";

export interface PillProps {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}

export function Pill({ tone = "default", children, className }: PillProps): ReactElement {
  return <span className={classNames("sfc-pill", tone !== "default" && `sfc-pill--${tone}`, className)}>{children}</span>;
}

export type ElementName = "market" | "moat" | "execution";

const ELEMENT_ICON: Record<ElementName, IconName> = {
  market: "coin",
  moat: "wall",
  execution: "rocket",
};

const ELEMENT_LABEL: Record<ElementName, string> = {
  market: "Market",
  moat: "Moat",
  execution: "Execution",
};

export interface ElementChipProps {
  element: ElementName;
  children?: ReactNode;
  className?: string;
}

export function ElementChip({ element, children, className }: ElementChipProps): ReactElement {
  return (
    <span className={classNames("sfc-chip", `sfc-chip--${element}`, className)}>
      <Icon name={ELEMENT_ICON[element]} size={14} className="sfc-chip__icon" />
      {children ?? ELEMENT_LABEL[element]}
    </span>
  );
}

export type OrgTitle = "Intern" | "Associate" | "Manager" | "Director" | "VP" | "President" | "CEO";

export const ORG_TITLES: readonly OrgTitle[] = [
  "Intern",
  "Associate",
  "Manager",
  "Director",
  "VP",
  "President",
  "CEO",
];

function titleTone(title: OrgTitle): "low" | "mid" | "high" | "ceo" {
  switch (title) {
    case "Intern":
    case "Associate":
    case "Manager":
      return "low";
    case "Director":
    case "VP":
      return "mid";
    case "President":
      return "high";
    case "CEO":
      return "ceo";
  }
}

export interface TitleBadgeProps {
  title: OrgTitle;
  headcount?: number;
  className?: string;
}

export function TitleBadge({ title, headcount, className }: TitleBadgeProps): ReactElement {
  const tone = titleTone(title);
  return (
    <span className={classNames("sfc-title", tone !== "low" && `sfc-title--${tone}`, className)}>
      {tone === "ceo" ? <Icon name="crown" size={12} /> : null}
      {title}
      {headcount !== undefined ? <span aria-label={`${headcount} people`}>/{headcount}</span> : null}
    </span>
  );
}

export type CloutTier = "S" | "A" | "B" | "C";

export interface CloutMeterProps {
  score: number;
  tier: CloutTier;
  className?: string;
}

export function CloutMeter({ score, tier, className }: CloutMeterProps): ReactElement {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <span className={classNames("sfc-clout", `sfc-clout--${tier.toLowerCase()}`, className)}>
      <span>Clout</span>
      <span className="sfc-clout__track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label="Clout">
        <span className="sfc-clout__fill" style={{ width: `${clamped}%`, display: "block" }} />
      </span>
      <span>
        <b>{clamped}</b> <span className="sfc-clout__tier">{tier}</span>
      </span>
    </span>
  );
}

export type StampTone = "red" | "sun" | "blue" | "good";

export interface StampProps {
  tone?: StampTone;
  size?: "md" | "lg";
  children: ReactNode;
  className?: string;
}

export function Stamp({ tone = "red", size = "md", children, className }: StampProps): ReactElement {
  return (
    <span className={classNames("sfc-stamp", tone !== "red" && `sfc-stamp--${tone}`, size === "lg" && "sfc-stamp--lg", className)}>
      {children}
    </span>
  );
}

export interface PanelProps {
  title?: ReactNode;
  label?: ReactNode;
  stripe?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({ title, label, stripe = false, className, bodyClassName, children }: PanelProps): ReactElement {
  return (
    <section className={classNames("sfc-panel", className)}>
      {stripe ? <div className="sfc-panel__stripe" aria-hidden="true" /> : null}
      {title !== undefined || label !== undefined ? (
        <header className="sfc-panel__head">
          {title !== undefined ? <h2 className="sfc-panel__title">{title}</h2> : <span />}
          {label !== undefined ? <span className="sfc-panel__label">{label}</span> : null}
        </header>
      ) : null}
      <div className={classNames("sfc-panel__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface NarrationBoxProps {
  text: string;
  speaker?: string;
  charactersPerSecond?: number;
  onDone?: () => void;
  className?: string;
}

export function NarrationBox({
  text,
  speaker = "Narration",
  charactersPerSecond = 40,
  onDone,
  className,
}: NarrationBoxProps): ReactElement {
  const reducedMotion = useReducedMotion();
  const [count, setCount] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (reducedMotion) {
      setCount(text.length);
      return;
    }
    setCount(0);
    if (text.length === 0) return;
    const step = Math.max(1, Math.round(charactersPerSecond / 40));
    const interval = Math.max(16, Math.round(1000 / charactersPerSecond));
    const id = window.setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          window.clearInterval(id);
          return current;
        }
        return Math.min(text.length, current + step);
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [text, reducedMotion, charactersPerSecond]);

  useEffect(() => {
    if (count >= text.length) doneRef.current?.();
  }, [count, text.length]);

  const shown = reducedMotion ? text : text.slice(0, count);
  const typing = count < text.length;

  return (
    <div className={classNames("sfc-narration", className)} aria-live="polite" aria-atomic="true">
      <span className="sfc-narration__tag">{speaker}</span>
      <p className="sfc-narration__text">
        {shown}
        {typing ? <span className="sfc-narration__caret" aria-hidden="true" /> : null}
      </p>
    </div>
  );
}

export interface SpeechBubbleProps {
  headline: ReactNode;
  meta?: ReactNode;
  align?: "left" | "right";
  className?: string;
  children?: ReactNode;
}

export function SpeechBubble({ headline, meta, align = "left", className, children }: SpeechBubbleProps): ReactElement {
  return (
    <div className={classNames("sfc-bubble", align === "right" && "sfc-bubble--right", className)}>
      <p className="sfc-bubble__headline">{headline}</p>
      {children}
      {meta !== undefined ? <p className="sfc-bubble__meta">{meta}</p> : null}
    </div>
  );
}

export interface StripeWipeProps {
  active: boolean;
  reverse?: boolean;
  onDone?: () => void;
}

export function StripeWipe({ active, reverse = false, onDone }: StripeWipeProps): ReactElement | null {
  const reducedMotion = useReducedMotion();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => doneRef.current?.(), reducedMotion ? 20 : 980);
    return () => window.clearTimeout(id);
  }, [active, reducedMotion]);

  if (!active) return null;
  return (
    <div className={classNames("sfc-wipe", "sfc-wipe--active", reverse && "sfc-wipe--reverse")} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="sfc-wipe__band" style={{ animationDelay: `${index * 55}ms` }} />
      ))}
    </div>
  );
}

export interface PlaceholderPageProps {
  kicker: string;
  title: string;
  body?: string;
}

export function PlaceholderPage({ kicker, title, body }: PlaceholderPageProps): ReactElement {
  return (
    <div className="sfc-page sfc-placeholder">
      <p className="sfc-placeholder__kicker">{kicker}</p>
      <h1 className="sfc-placeholder__title">{title}</h1>
      {body ? <p className="sfc-placeholder__body">{body}</p> : null}
      <div className="sfc-placeholder__line" aria-hidden="true" />
    </div>
  );
}
