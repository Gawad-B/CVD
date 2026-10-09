import { useId, useState, type ReactNode } from "react";
import { Info, Lightbulb } from "lucide-react";

/** Small (i) button that shows a plain-language explanation on hover, focus or tap. */
export function InfoTip({ text, label = "More information" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full text-[#8fa1c4] transition-colors hover:text-[#1f5eff] focus-visible:text-[#1f5eff]"
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-[260px] max-w-[80vw] -translate-x-1/2 rounded-[12px] bg-[#0b1530] px-3 py-2 text-left text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** Light-blue "how to use this page" hint box. */
export function HelpHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="note" className={`flex gap-2.5 rounded-[14px] bg-[#eaf1ff] px-4 py-3 text-[13px] leading-relaxed text-[#1e3a8a] ${className ?? ""}`}>
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
