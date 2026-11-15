/**
 * Fighter card dialog: a modal wrapper around the cards-registry screen.
 * Escape and a backdrop click close it; focus starts on the close button,
 * stays inside the dialog while it is open, and returns to the opener.
 */

import { useEffect, useRef, type ReactElement } from "react";

import { FighterCard } from "../cards/FighterCard.js";
import type { FighterCardProps } from "../cards/types.js";
import { classNames } from "../styles/components.js";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export interface FighterCardDialogProps {
  card: FighterCardProps;
  onClose: () => void;
}

export function FighterCardDialog({ card, onClose }: FighterCardDialogProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => !element.hasAttribute("disabled"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      returnRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="sfc-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="sfc-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Fighter card for ${card.entrant.name}`}
      >
        <div className="sfc-dialog__bar">
          <span className="sfc-kicker">Fighter card</span>
          <button
            ref={closeRef}
            type="button"
            className={classNames("sfc-btn", "sfc-btn--sm")}
            onClick={onClose}
          >
            Close card
          </button>
        </div>
        <FighterCard {...card} />
      </div>
    </div>
  );
}
