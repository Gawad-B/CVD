import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, topmost last: Escape only closes the topmost one. */
const modalStack: symbol[] = [];

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  /** Hide the visible title (kept for screen readers). */
  hideTitle?: boolean;
};

export function Modal({ open, onClose, title, children, className, hideTitle = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const stackId = useRef(Symbol("modal"));

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const id = stackId.current;
    modalStack.push(id);
    const isTop = () => modalStack[modalStack.length - 1] === id;
    const focusables = () => (dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    (focusables()[0] ?? dialog)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (!isTop()) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (active && !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = modalStack.indexOf(id);
      if (at >= 0) modalStack.splice(at, 1);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[rgba(11,21,48,.45)] p-4 backdrop-blur-[6px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-[420px] rounded-[24px] bg-white p-7 shadow-[0_40px_90px_-30px_rgba(11,21,48,.5)]",
          className
        )}
      >
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f6fc] text-[#33405a] hover:bg-[#e8eefb]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <h2
          id={titleId}
          className={cn("pr-10 text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#0b1530]", hideTitle && "sr-only")}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body
  );
}
