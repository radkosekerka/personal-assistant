import Link from "next/link";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="sub">
        <Link href="/finance">Účty a pohyby</Link>
        <Link href="/finance/propojeni">Bankovní propojení</Link>
      </nav>
      {children}
    </>
  );
}
