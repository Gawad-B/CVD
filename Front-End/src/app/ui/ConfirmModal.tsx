import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive styling for the confirm button. */
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

/** In-app replacement for window.confirm. Awaits `onConfirm` and keeps the dialog open while it runs. */
export function ConfirmModal({ open, title, message, confirmLabel, danger = false, onConfirm, onClose }: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title}>
      <p className="mt-3 text-[14px] leading-relaxed text-[#33405a]">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => void confirm()}
          disabled={busy}
          className={danger ? "!bg-none !bg-[#dc2626] !shadow-none" : undefined}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
