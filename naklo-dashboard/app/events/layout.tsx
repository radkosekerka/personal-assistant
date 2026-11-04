import Link from "next/link";

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="sub">
        <Link href="/events">Akce a poptávky</Link>
        <Link href="/events/pr">PR</Link>
      </nav>
      {children}
    </>
  );
}
