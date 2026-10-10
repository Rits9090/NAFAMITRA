import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Shared overlay — the single positioning authority for every dialog in the app.
 *
 * Why a portal: pages wrap content in `.animate-fadeInUp`, whose fill-mode
 * keeps a non-none `transform` after it finishes. A transformed ancestor
 * becomes the containing block for `position: fixed` children, so hand-rolled
 * "fixed inset-0" overlays rendered inside page content were positioned
 * against the content box (cut off / shifted / under the header) instead of
 * the viewport. Rendering into `document.body` escapes every transformed or
 * overflowing ancestor and gives us one place to enforce viewport-safe
 * sizing, scroll-lock, focus management and keyboard behaviour.
 *
 * Variants:
 *   sheet   — bottom sheet on mobile, centered dialog from sm: up (default)
 *   center  — always centered (confirmations)
 *   drawer  — full-height panel sliding from the left edge (mobile nav)
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  label,
  labelledBy,
  role = 'dialog',
  variant = 'sheet',
  size = 'sm',
  panelTestId,
  panelClassName = '',
  overlayClassName = '',
  closeOnOverlay = true,
  hideOverlay = false,
  children,
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  const handleOverlayClick = useCallback(
    (e) => {
      if (!closeOnOverlay || !onClose) return;
      if (e.target === e.currentTarget || e.target.classList.contains('nm-overlay-bg')) onClose();
    },
    [closeOnOverlay, onClose]
  );

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    document.body.classList.add('nm-scroll-lock');

    // Move focus into the panel (first focusable, else the panel itself).
    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector(FOCUSABLE);
      if (first) setTimeout(() => first.focus(), 0);
      else panel.focus();
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (onClose) onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // Focus trap: keep keyboard users inside the open dialog.
      const items = panel ? Array.from(panel.querySelectorAll(FOCUSABLE)) : [];
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || active === panel)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('nm-scroll-lock');
      const r = restoreRef.current;
      if (r && typeof r.focus === 'function') setTimeout(() => { try { r.focus(); } catch (_) { /* detached */ } }, 0);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`nm-overlay nm-overlay-${variant} ${overlayClassName}`}
      onClick={handleOverlayClick}
      data-testid="nm-overlay"
    >
      {!hideOverlay && <div className="nm-overlay-bg" aria-hidden="true" />}
      <div
        ref={panelRef}
        className={`nm-panel nm-panel-${size} ${panelClassName}`}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid={panelTestId}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
