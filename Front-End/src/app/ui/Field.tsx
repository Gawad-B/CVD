import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-[12px] border border-[#d6deec] bg-white px-3.5 text-[15px] text-[#0b1530] placeholder:text-[#8fa1c4] transition-colors focus:border-[#1f5eff] disabled:cursor-not-allowed disabled:bg-[#f3f6fc] disabled:opacity-70";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(control, "h-[46px]", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <select ref={ref} className={cn(control, "h-[46px] appearance-auto", className)} {...props}>
      {children}
    </select>
  );
});

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /** Render-prop receives the generated id and aria props to spread on the control. */
  children: (control: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
};

/** Label + control + hint/error wiring. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-[#33405a]">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {(error || hint) && (
        <p id={describedBy} role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-[#b91c1c]" : "text-[#5b6b85]")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
