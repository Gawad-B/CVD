import { Activity, Calendar, ChevronRight, ClipboardList, HeartPulse, Play, ShieldCheck as ShieldIcon, Stethoscope } from "lucide-react";
import { DemoCta } from "./DemoCta";
import { MODEL_FACTS } from "./modelFacts";

const NAV = [
  ["#how", "How it works"],
  ["#model", "The model"],
  ["#team", "Care team"],
  ["#security", "Security"],
] as const;

const glass =
  "rounded-2xl border border-white/90 bg-white/55 p-3.5 shadow-[0_10px_30px_-12px_rgba(31,60,120,.3)] backdrop-blur-[14px]";

export function Hero() {
  return (
    <div
      id="top"
      className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_60%_40%,#fff_0%,#f1f5fc_55%,#e6edf8_100%)] px-[clamp(20px,3vw,40px)] pb-7 pt-[22px] shadow-[0_30px_80px_-30px_rgba(31,60,120,.25)]"
    >
      <nav aria-label="Primary" className="relative z-[2] flex flex-wrap items-center gap-3 min-[420px]:gap-6">
        <a href="#top" className="mr-auto flex items-center gap-2.5 whitespace-nowrap text-[#0b1530] hover:text-[#0b1530]">
          <img src="/cardiovascular.png" alt="" width={34} height={34} className="block h-[34px] w-[34px]" />
          <span className="text-[20px] font-bold tracking-[-0.02em]">CardioScreen</span>
        </a>
        <div className="hidden gap-9 text-[14px] font-medium min-[1025px]:flex">
          <a href="#top" aria-current="page" className="flex flex-col items-center gap-1 whitespace-nowrap font-semibold text-[#0b1530] hover:text-[#0b1530]">
            Home
            <span className="h-[5px] w-[5px] rounded-full bg-[#1f5eff]" />
          </a>
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="whitespace-nowrap text-[#33405a] hover:text-[#1f5eff]">
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <DemoCta
            label="Try a demo"
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[linear-gradient(180deg,#2f6bff,#1a52f0)] px-5 min-[420px]:px-6 text-[14px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(31,94,255,.6)] transition-[transform,box-shadow] duration-[160ms] hover:-translate-y-px hover:text-white hover:shadow-[0_14px_28px_-8px_rgba(31,94,255,.7)] active:scale-[.98] motion-reduce:translate-none motion-reduce:scale-none motion-reduce:hover:translate-none motion-reduce:active:scale-none motion-reduce:transition-none"
          />
        </div>
      </nav>

      <div
        aria-hidden="true"
        className="lp-word pointer-events-none absolute inset-x-0 top-[70px] z-0 select-none whitespace-nowrap text-center text-[clamp(90px,15vw,230px)] font-bold leading-none tracking-[-0.02em] text-[#e3e9f3]"
      >
        CARDIOLOGY
      </div>

      <div className="relative z-[1] mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-6">
        <div className="pb-6 pt-[clamp(40px,8vw,120px)]">
          <h1 className="m-0 text-[clamp(40px,4.4vw,64px)] font-semibold leading-[1.08] tracking-[-0.035em]">
            <span className="block text-[#0b1530]">Earlier signals.</span>
            <span className="block text-[#1f5eff]">A steadier heart.</span>
          </h1>
          <p className="mt-5 max-w-[34ch] text-[17px] leading-[1.55] text-[#5b6b85]">
            Cardiovascular risk screening that turns every encounter into a clear, reviewable recommendation.
          </p>
          <DemoCta
            label="Start a screening"
            iconSize={17}
            className="mt-8 inline-flex h-[58px] items-center gap-2.5 whitespace-nowrap rounded-full bg-[linear-gradient(180deg,#2f6bff,#1a52f0)] px-[38px] text-[16px] font-semibold text-white shadow-[0_18px_36px_-12px_rgba(31,94,255,.65)] transition-[transform,box-shadow] duration-[180ms] hover:-translate-y-0.5 hover:text-white hover:shadow-[0_22px_40px_-12px_rgba(31,94,255,.75)] active:scale-[.98] motion-reduce:translate-none motion-reduce:scale-none motion-reduce:hover:translate-none motion-reduce:active:scale-none motion-reduce:transition-none"
          />
        </div>

        <div className="relative flex flex-col items-stretch gap-4 min-[700px]:min-h-[480px] min-[700px]:flex-row min-[700px]:items-center min-[700px]:gap-5">
          <div className="relative h-[360px] min-w-0 flex-1 overflow-hidden rounded-[28px] shadow-[0_24px_60px_-28px_rgba(31,60,120,.45)] min-[700px]:h-[520px]">
            <img
              src="/landing/hero.jpg"
              alt="Doctor in a white coat with a stethoscope"
              // React 18 does not know the camelCase `fetchPriority` prop (console warning); the lowercase attribute works.
              {...{ fetchpriority: "high" }}
              className="lp-zoom block h-full w-full object-cover object-[62%_12%]"
            />
          </div>

          <div className="pointer-events-none flex flex-wrap gap-3 min-[700px]:absolute min-[700px]:flex-col min-[700px]:right-[84px] min-[700px]:top-5 min-[700px]:w-[168px] min-[700px]:gap-3.5">
            <div className={`lp-float flex-[1_1_140px] min-[700px]:flex-none ${glass}`} style={{ "--dur": "3200ms", "--delay": "0ms" } as React.CSSProperties}>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1f5eff]">
                <HeartPulse width={16} height={16} aria-hidden />
                Risk score
              </div>
              <div className="mt-1.5 text-[28px] font-bold tracking-[-0.02em] tabular-nums">0.27</div>
              <div className="mt-0.5 text-[11.5px] text-[#5b6b85]">Low · routine follow-up</div>
            </div>
            <div className={`lp-float flex-[1_1_140px] min-[700px]:ml-6 min-[700px]:flex-none ${glass}`} style={{ "--dur": "3700ms", "--delay": "400ms" } as React.CSSProperties}>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1f5eff]">
                <Activity width={16} height={16} aria-hidden />
                Blood pressure
              </div>
              <div className="mt-1.5 text-[22px] font-bold tracking-[-0.02em] tabular-nums">128/82</div>
            </div>
            <div className={`lp-float flex-[1_1_140px] min-[700px]:flex-none ${glass}`} style={{ "--dur": "4200ms", "--delay": "800ms" } as React.CSSProperties}>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1f5eff]">
                <ClipboardList width={16} height={16} aria-hidden />
                Lipid panel
              </div>
              <div className="mt-1.5 text-[12.5px] leading-[1.5] text-[#33405a]">Total 196 · HDL 52</div>
            </div>
            <p className="m-0 w-full text-center text-[11px] font-medium text-[#5b6b85]">Example patient</p>
          </div>

          <div className="flex flex-none flex-row justify-center gap-3 self-center rounded-full bg-white p-2.5 min-[700px]:flex-col shadow-[0_10px_30px_-10px_rgba(31,60,120,.25)]" role="presentation">
            <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-[#1f5eff] text-white shadow-[0_8px_18px_-6px_rgba(31,94,255,.6)]">
              <Stethoscope width={20} height={20} aria-hidden />
            </span>
            <span className="grid h-[46px] w-[46px] place-items-center rounded-full text-[#0b1530]">
              <Calendar width={20} height={20} aria-hidden />
            </span>
            <span className="grid h-[46px] w-[46px] place-items-center rounded-full text-[#0b1530]">
              <HeartPulse width={20} height={20} aria-hidden />
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-[1] mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] items-end gap-5">
        <a
          href="#how"
          className="relative block h-32 overflow-hidden rounded-[18px] bg-[#c9d6ea] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:translate-none motion-reduce:scale-none motion-reduce:hover:translate-none motion-reduce:active:scale-none motion-reduce:transition-none"
        >
          <img src="/landing/video.jpg" alt="" loading="lazy" className="block h-full w-full object-cover" />
          <span className="pointer-events-none absolute inset-0 flex items-center gap-4 bg-[linear-gradient(90deg,rgba(11,21,48,.55)_0%,rgba(11,21,48,.1)_70%)] px-[22px]">
            <span className="grid h-[52px] w-[52px] flex-none place-items-center rounded-full bg-white text-[#0b1530]">
              <Play width={18} height={18} fill="currentColor" aria-hidden />
            </span>
            <span className="text-[16px] font-semibold leading-[1.3] text-white">
              See how
              <br />
              it works
            </span>
          </span>
        </a>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] border border-white bg-white/80 px-6 py-5 shadow-[0_14px_40px_-18px_rgba(31,60,120,.3)] backdrop-blur-[12px]">
          {[
            [Activity, MODEL_FACTS.rocAuc, "ROC AUC"],
            [ShieldIcon, MODEL_FACTS.recall, "Recall"],
            [ClipboardList, MODEL_FACTS.inputs, "Clinical inputs"],
          ].map(([Icon, value, label]) => {
            const I = Icon as typeof Activity;
            return (
              <div key={label as string} className="flex flex-[1_1_120px] items-center gap-3">
                <span className="grid h-9 w-9 flex-none place-items-center text-[#1f5eff]">
                  <I width={26} height={26} aria-hidden />
                </span>
                <div>
                  <div className="text-[22px] font-bold tracking-[-0.02em] tabular-nums">{value as string}</div>
                  <div className="mt-0.5 whitespace-nowrap text-[12px] text-[#5b6b85]">{label as string}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-[20px] border border-white bg-white/85 p-3 shadow-[0_14px_40px_-18px_rgba(31,60,120,.3)] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:translate-none motion-reduce:scale-none motion-reduce:hover:translate-none motion-reduce:active:scale-none motion-reduce:transition-none">
          <div className="h-24 overflow-hidden rounded-[14px] bg-[#dbe4f2]">
            <img src="/landing/team.jpg" alt="" loading="lazy" className="block h-full w-full object-cover" />
          </div>
          <div className="flex items-center gap-3 px-1 pb-1 pt-3">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">Built for the care team</div>
              <div className="mt-0.5 text-[12.5px] leading-[1.45] text-[#5b6b85]">Doctors, clinicians, admins and auditors.</div>
            </div>
            <a
              href="#team"
              aria-label="Care team"
              className="grid h-10 w-10 flex-none place-items-center rounded-full border-[1.5px] border-[#1f5eff] text-[#1f5eff] transition-colors duration-[160ms] hover:bg-[#eef3fd]"
            >
              <ChevronRight width={16} height={16} strokeWidth={2.2} aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

