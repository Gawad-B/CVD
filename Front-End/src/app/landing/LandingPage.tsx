import { useRef } from "react";
import { Button, Modal } from "../ui";
import { DemoProvider, useDemo } from "./DemoContext";
import { Hero } from "./Hero";
import { CtaSection, Footer, HowItWorks, ModelSection, SecuritySection, TeamSection } from "./Sections";
import { useReveal } from "./useReveal";
import "./landing.css";

function DemoErrorModal() {
  const { error, dismissError } = useDemo();
  return (
    <Modal open={error !== null} onClose={dismissError} title="Demo unavailable">
      <p className="mt-3 text-[14.5px] leading-[1.55] text-[#33405a]">{error}</p>
      <Button size="lg" className="mt-6 w-full" onClick={dismissError}>
        Back
      </Button>
    </Modal>
  );
}

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  return (
    <DemoProvider>
      <div
        ref={rootRef}
        className="box-border min-h-screen bg-[#dfe7f3] p-[clamp(8px,1.5vw,20px)] font-sans text-[#0b1530] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-[#1f5eff] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[#1f5eff]"
      >
        <main>
          <Hero />
          <HowItWorks />
          <ModelSection />
          <TeamSection />
          <SecuritySection />
          <CtaSection />
        </main>
        <Footer />
      </div>
      <DemoErrorModal />
    </DemoProvider>
  );
}
