import { useEffect, type RefObject } from "react";

/** Fades in `[data-reveal]` elements below the fold once, when 15% visible. No-op without IntersectionObserver or under reduced motion. */
export function useReveal(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealState = "shown";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 }
    );
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.dataset.revealState = "pending";
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, [rootRef]);
}
