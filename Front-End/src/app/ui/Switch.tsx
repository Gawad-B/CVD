import { cn } from "./cn";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

/** 46x26 toggle; `label` is the accessible name. */
export function Switch({ checked, onChange, label, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-150",
        checked ? "bg-[#1f5eff]" : "bg-[#cdd5e2]",
        disabled && "cursor-not-allowed opacity-55",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
          checked && "translate-x-5"
        )}
      />
    </button>
  );
}
