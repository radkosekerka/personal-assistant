import { notFound } from "next/navigation";
import { MODULES } from "@/lib/modules";

/** Připravované moduly: co ukážou a odkud vezmou data. */
export default async function SoonModule({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const m = MODULES.find((x) => x.key === module && !x.live);
  if (!m) notFound();
  return (
    <>
      <h1>{m.name}</h1>
      <p>{m.summary}</p>
      <div className="card empty">
        Modul se připravuje. Data budou z: {m.sources.join(", ")}.
      </div>
    </>
  );
}

export function generateStaticParams() {
  return MODULES.filter((m) => !m.live).map((m) => ({ module: m.key }));
}
