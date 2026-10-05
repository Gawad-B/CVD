import { cn } from "../ui";

const MODEL_URL = "https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089";
const AUTHOR_URL = "https://sketchfab.com/neshallads";

/** Attribution required by the model's CC-BY licence. Keep visible wherever the heart is shown. */
export function HeartCredit({ className }: { className?: string }) {
  return (
    <div className={cn("text-right text-[11.5px] text-[#5b6b85]", className)}>
      <a href={MODEL_URL} target="_blank" rel="noopener noreferrer" className="font-semibold">
        Realistic Human Heart
      </a>{" "}
      by{" "}
      <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="font-semibold">
        neshallads
      </a>{" "}
      on Sketchfab
    </div>
  );
}
