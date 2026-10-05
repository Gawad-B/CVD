import { Link } from "react-router";
import { ShieldAlert } from "lucide-react";
import { Card, buttonClasses } from "../ui";

export function Forbidden() {
  return (
    <Card className="mx-auto mt-6 max-w-xl p-10 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#fee2e2] text-[#b91c1c]">
        <ShieldAlert className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="text-[clamp(26px,2.6vw,34px)] font-bold leading-tight tracking-[-0.03em] text-[#0b1530]">Access denied</h1>
      <p className="mb-6 mt-2 text-[14px] text-[#5b6b85]">You don&apos;t have permission to open this page.</p>
      <Link to="/dashboard" className={buttonClasses("primary", "md")}>
        Go to dashboard
      </Link>
    </Card>
  );
}
