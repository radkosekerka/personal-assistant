import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 420, margin: "64px auto", textAlign: "center" }}>
      <h1>HR Náklo</h1>
      <p className="muted">Přístup jen pro povolené účty @wakesurfnaklo.cz.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="primary" type="submit">Přihlásit přes Google</button>
      </form>
    </div>
  );
}
