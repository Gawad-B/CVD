import { ArrowRight, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { cn } from "../ui";
import { useDemo } from "./DemoContext";

type DemoCtaProps = {
  /** Label while signed out. */
  label: string;
  className: string;
  /** Icon size in px. */
  iconSize?: number;
};

/** "Try a demo"-style button; signed-in visitors get an "Open app" link instead. */
export function DemoCta({ label, className, iconSize = 15 }: DemoCtaProps) {
  const { authenticated, pending, start } = useDemo();

  if (authenticated) {
    return (
      <Link to="/dashboard" className={className}>
        Open app
        <ArrowRight width={iconSize} height={iconSize} aria-hidden />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      disabled={pending}
      aria-busy={pending}
      className={cn(className, "disabled:cursor-not-allowed disabled:opacity-70")}
    >
      {pending ? (
        <>
          <Loader2 width={iconSize} height={iconSize} className="lp-spin" aria-hidden />
          Creating your demo…
        </>
      ) : (
        <>
          {label}
          <ArrowRight width={iconSize} height={iconSize} aria-hidden />
        </>
      )}
    </button>
  );
}
