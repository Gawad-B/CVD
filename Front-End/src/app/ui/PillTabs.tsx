import { cn } from "./cn";

export interface PillTab<T extends string = string> {
  value: T;
  label: string;
}

type PillTabsProps<T extends string> = {
  tabs: readonly PillTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

/** Segmented filter (white pill group, blue active tab). For routed nav use the AppShell tab links. */
export function PillTabs<T extends string>({ tabs, value, onChange, label, className }: PillTabsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex gap-1 rounded-full bg-white p-[5px] shadow-[0_4px_14px_rgba(31,60,120,.06)]", className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "h-[38px] rounded-full px-[18px] text-[13.5px] font-semibold transition-colors duration-[180ms]",
              active ? "bg-[#1f5eff] text-white" : "bg-transparent text-[#33405a] hover:bg-[#e8eefb]"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
