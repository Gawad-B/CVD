import type { CSSProperties, ReactNode } from "react";
import { DemoCta } from "./DemoCta";
import featureImportance from "./featureImportance.json";
import { MODEL_FACTS } from "./modelFacts";

const section = "mx-auto mt-[clamp(56px,8vw,110px)] max-w-[1440px] px-[clamp(20px,3vw,40px)]";
const eyebrow = "text-[13px] font-semibold uppercase tracking-[0.12em] text-[#1f5eff]";
const h2 = "font-semibold leading-[1.1] tracking-[-0.03em] text-[#0b1530]";
const cardShadow = "shadow-[0_14px_40px_-22px_rgba(31,60,120,.35)]";

const STEPS = [
  ["01", "Capture the encounter", `Vitals, labs and history flow in from the visit — ${MODEL_FACTS.inputsWord} routine inputs, nothing extra to collect.`],
  ["02", "Score the risk", "The model returns a risk score with the factors that drove it, in seconds."],
  ["03", "Review and sign off", "A clinician accepts, adjusts or overrides — every decision is recorded for audit."],
] as const;

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={section}>
      <div data-reveal className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className={eyebrow}>How it works</div>
          <h2 id="how-title" className={`${h2} mt-3 max-w-[16ch] text-[clamp(32px,3.4vw,48px)]`}>
            From encounter to recommendation in three steps.
          </h2>
        </div>
        <p className="m-0 max-w-[40ch] text-[16px] leading-[1.6] text-[#5b6b85]">
          Every step is logged, reviewable and signed off by a clinician — the model advises, people decide.
        </p>
      </div>
      <div className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
        {STEPS.map(([n, title, body]) => (
          <div
            key={n}
            data-reveal
            className={`rounded-[22px] bg-white p-7 ${cardShadow} transition-[transform,box-shadow] duration-[220ms] hover:-translate-y-1 hover:shadow-[0_22px_50px_-22px_rgba(31,60,120,.45)] motion-reduce:translate-none motion-reduce:scale-none motion-reduce:hover:translate-none motion-reduce:active:scale-none motion-reduce:transition-none`}
          >
            <span className="text-[44px] font-bold tracking-[-0.04em] text-[#e3e9f3] tabular-nums">{n}</span>
            <div className="mt-[22px] text-[19px] font-bold text-[#0b1530]">{title}</div>
            <div className="mt-2 text-[14.5px] leading-[1.6] text-[#5b6b85]">{body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const METRICS = [
  [MODEL_FACTS.accuracy, "Accuracy"],
  [MODEL_FACTS.rocAuc, "ROC AUC"],
  [MODEL_FACTS.recall, "Recall"],
  [MODEL_FACTS.precision, "Precision"],
] as const;

export function ModelSection() {
  return (
    <section id="model" aria-labelledby="model-title" className={section}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-stretch gap-6">
        <div data-reveal className="relative min-h-[440px] overflow-hidden rounded-[28px] bg-[#c9d6ea]">
          <img
            src="/landing/model.jpg"
            alt="Stethoscope resting on a bed sheet"
            loading="lazy"
            className="absolute inset-0 block h-full w-full object-cover"
          />
          <div className="absolute bottom-5 left-5 right-5 flex w-fit max-w-full items-center gap-3 rounded-2xl border border-white bg-white/75 px-[18px] py-4 backdrop-blur-[14px]">
            <span className="h-2.5 w-2.5 flex-none rounded-full bg-[#1fbf75] shadow-[0_0_0_4px_rgba(31,191,117,.2)]" />
            <span className="text-[13px] font-semibold text-[#0b1530]">
              {MODEL_FACTS.version} · evaluated on a 134-patient test set
            </span>
          </div>
        </div>
        <div data-reveal className="flex flex-col gap-7 rounded-[28px] bg-[#0b1530] p-[clamp(28px,3vw,44px)] text-white">
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8fb0ff]">The model</div>
            <h2 id="model-title" className="mt-3 text-[clamp(30px,3vw,42px)] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
              Tuned to catch risk, not to hide it.
            </h2>
            <p className="mt-3.5 max-w-[46ch] text-[15.5px] leading-[1.6] text-[#b9c5dc]">
              A stacked ensemble (XGBoost, LightGBM, random forest and logistic regression) trained on{" "}
              {MODEL_FACTS.inputsWord} routine clinical inputs. Scores are decision support — not calibrated to population prevalence.
            </p>
          </div>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            {METRICS.map(([value, label]) => (
              <div key={label} className="flex flex-col-reverse rounded-2xl border border-white/10 bg-white/[.06] p-[18px]">
                <dt className="mt-1 text-[12.5px] font-normal text-[#b9c5dc]">{label}</dt>
                <dd className="m-0 text-[28px] font-bold tracking-[-0.02em] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {featureImportance.map((item, index) => (
                <li key={item.label} className="flex items-center gap-3 text-[13.5px] text-[#dbe4f5]">
                  <span className="flex-[0_0_140px] whitespace-nowrap">{item.label}</span>
                  <span
                    role="img"
                    aria-label={`${item.label}: ${item.value}% of the strongest input`}
                    className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/10"
                  >
                    <span
                      data-bar
                      style={{ width: `${item.value}%`, "--i": index } as CSSProperties}
                      className="block h-full rounded-[3px] bg-[linear-gradient(90deg,#2f6bff,#8fb0ff)]"
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mb-0 mt-3 text-[12px] text-[#b9c5dc]">Average importance across the XGBoost, LightGBM and random forest models</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const ROLES = [
  ["Doctors", "Review scores and sign off recommendations.", "/landing/doctors.jpg", "50% 25%"],
  ["Clinicians", "Capture encounters and run screenings.", "/landing/clinicians.jpg", "50% 20%"],
  ["Admins", "Manage users, clinics and access.", "/landing/admins.jpg", "72% 30%"],
  ["Auditors", "Trace every decision end to end.", "/landing/auditors.jpg", "50% 15%"],
] as const;

export function TeamSection() {
  return (
    <section id="team" aria-labelledby="team-title" className={section}>
      <div data-reveal className="text-center">
        <div className={eyebrow}>Care team</div>
        <h2 id="team-title" className={`${h2} mx-auto mt-3 max-w-[20ch] text-[clamp(32px,3.4vw,48px)]`}>
          One workspace, four roles.
        </h2>
      </div>
      <div className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-5">
        {ROLES.map(([title, body, src, position]) => (
          <div
            key={title}
            data-reveal
            className={`group rounded-[22px] bg-white p-3 ${cardShadow} transition-transform duration-[220ms] hover:-translate-y-1 motion-reduce:translate-none motion-reduce:scale-none motion-reduce:hover:translate-none motion-reduce:active:scale-none motion-reduce:transition-none`}
          >
            <div className="h-[220px] overflow-hidden rounded-2xl bg-[#dbe4f2]">
              <img
                src={src}
                alt=""
                loading="lazy"
                style={{ objectPosition: position }}
                className="block h-full w-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            </div>
            <div className="px-2 pb-2 pt-4">
              <div className="text-[17px] font-bold text-[#0b1530]">{title}</div>
              <div className="mt-1.5 text-[13.5px] leading-[1.55] text-[#5b6b85]">{body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const SECURITY = [
  ["Role-based access", "Each role sees only what it needs."],
  ["Audit trail", "Every view and decision is logged."],
  ["Encryption", "Identifiers encrypted at rest; TLS in transit."],
  ["Human in the loop", "The model advises; clinicians decide."],
] as const;

export function SecuritySection() {
  return (
    <section id="security" aria-labelledby="security-title" className={section}>
      <div
        data-reveal
        className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-10 rounded-[28px] bg-white p-[clamp(28px,4vw,56px)] ${cardShadow}`}
      >
        <div>
          <div className={eyebrow}>Security</div>
          <h2 id="security-title" className={`${h2} mt-3 text-[clamp(30px,3vw,42px)] leading-[1.12]`}>
            Patient data stays where it belongs.
          </h2>
          <p className="mt-3.5 max-w-[42ch] text-[15.5px] leading-[1.6] text-[#5b6b85]">
            Role-based access, full audit trails, encrypted identifiers at rest and TLS in transit.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
          {SECURITY.map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-[#f3f6fc] p-4">
              <div className="text-[14.5px] font-bold text-[#0b1530]">{title}</div>
              <div className="mt-[3px] text-[13px] leading-[1.5] text-[#5b6b85]">{body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaSection() {
  return (
    <section aria-labelledby="cta-title" className={section}>
      <div
        data-reveal
        className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#1f5eff_0%,#1446d1_100%)] px-[clamp(24px,4vw,56px)] py-[clamp(40px,6vw,80px)] text-center text-white"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[120px] w-full -translate-y-1/2 opacity-[.18]"
        >
          <path
            className="lp-ecg"
            pathLength={100}
            d="M0 60 H380 L410 60 L430 20 L455 105 L480 10 L505 60 H700 L725 60 L745 30 L770 95 L790 60 H1200"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h2 id="cta-title" className="relative mx-auto max-w-[18ch] text-[clamp(32px,3.6vw,52px)] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
          Bring earlier signals to your clinic.
        </h2>
        <p className="relative mx-auto mt-4 max-w-[44ch] text-[16px] leading-[1.6] text-[#dbe6ff]">
          Explore a personal demo workspace with synthetic patients — ready in one click.
        </p>
        <DemoCta
          label="Try a demo"
          iconSize={16}
          className="relative mt-[30px] inline-flex h-14 items-center gap-2.5 rounded-full bg-white px-[34px] text-[15px] font-bold text-[#1f5eff] transition-transform duration-[180ms] hover:-translate-y-0.5 hover:text-[#1f5eff] active:scale-[.98] motion-reduce:translate-none motion-reduce:scale-none motion-reduce:hover:translate-none motion-reduce:active:scale-none motion-reduce:transition-none"
        />
      </div>
    </section>
  );
}

export function Footer(): ReactNode {
  return (
    <footer className="mx-auto mt-10 flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-[clamp(20px,3vw,40px)] pb-8 pt-6 text-[13px] text-[#5b6b85]">
      <div className="flex items-center gap-2.5">
        <img src="/cardiovascular.png" alt="" width={24} height={24} className="h-6 w-6" />
        <span className="font-bold text-[#0b1530]">CardioScreen</span>
      </div>
      <nav aria-label="Footer" className="flex gap-6">
        {[
          ["#how", "How it works"],
          ["#model", "The model"],
          ["#team", "Care team"],
          ["#security", "Security"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="text-[#5b6b85]">
            {label}
          </a>
        ))}
      </nav>
      <span>Decision support only — not a diagnosis.</span>
    </footer>
  );
}
