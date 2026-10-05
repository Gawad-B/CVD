import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none transition-[transform,box-shadow,background-color,border-color,color] duration-150 active:scale-[.97] motion-reduce:scale-none motion-reduce:active:scale-none motion-reduce:translate-none motion-reduce:hover:translate-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[linear-gradient(180deg,#2f6bff,#1a52f0)] text-white shadow-[0_10px_24px_-8px_rgba(31,94,255,.6)] hover:-translate-y-px motion-reduce:hover:translate-none",
  secondary: "border-[1.5px] border-[#d6deec] bg-white text-[#0b1530] hover:border-[#1f5eff]",
  ghost: "bg-transparent text-[#33405a] hover:bg-[#e8eefb]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-[42px] px-5 text-[13.5px]",
  lg: "h-12 px-7 text-[15px]",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref
) {
  return <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...props} />;
});
