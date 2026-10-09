import type { ReactNode } from "react";
import { HelpHint } from "../ui/InfoTip";

/** Page H1 (clamp 26-34px) with a 14px muted subtitle, an optional right-aligned action and a "how to use" hint. */
export function PageHeader({ title, subtitle, action, help }: { title: string; subtitle?: string; action?: ReactNode; help?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[clamp(26px,2.6vw,34px)] font-bold leading-[1.1] tracking-[-0.03em] text-[#0b1530]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-[#5b6b85]">{subtitle}</p>}
      </div>
      {action}
    </div>
    {help && <HelpHint>{help}</HelpHint>}
    </div>
  );
}
