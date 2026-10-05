import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Inner tile surface (#f3f6fc, radius 14) instead of a white card. */
  tile?: boolean;
};

export function Card({ tile = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        tile
          ? "rounded-[14px] bg-[#f3f6fc] p-3.5"
          : "rounded-[22px] bg-white p-5 shadow-[0_14px_40px_-26px_rgba(31,60,120,.4)]",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-[17px] font-bold leading-tight text-[#0b1530]", className)} {...props} />;
}
