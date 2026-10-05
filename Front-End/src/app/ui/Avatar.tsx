import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type AvatarProps = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  size?: number;
  /** round = 999 radius (user avatar); square = radius 12 (patient rows). */
  shape?: "round" | "square";
};

export function Avatar({ name, size = 42, shape = "round", className, style, ...props }: AvatarProps) {
  return (
    <span
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-[#1f5eff] text-[13px] font-bold text-white",
        shape === "round" ? "rounded-full" : "rounded-[12px]",
        className
      )}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {initialsOf(name)}
    </span>
  );
}
