import Link from "next/link";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="sub">
        <Link href="/hr">Přehled</Link>
        <Link href="/hr/lide">Lidé</Link>
        <Link href="/hr/mesic">Měsíc</Link>
        <Link href="/hr/red-flags">Red flags</Link>
        <Link href="/hr/ukoly">Úkoly</Link>
      </nav>
      {children}
    </>
  );
}
