import Link from "next/link";
import { AuthForm } from "../../components/auth-form";
import { SiteHeader } from "../../components/site-header";

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <AuthForm
          title="Create your account"
          subtitle="Register with email and password. You must verify email before signing in."
          actionPath="/auth/register"
          submitLabel="Register"
          onSuccessMessage="Account created. Check .data/mail on the server for the verification link."
          fields={[
            { name: "name", label: "Name", autoComplete: "name" },
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            {
              name: "password",
              label: "Password (12+ characters)",
              type: "password",
              autoComplete: "new-password",
            },
          ]}
        />
        <p className="mx-auto mt-6 max-w-md text-sm text-muted">
          Already registered?{" "}
          <Link className="text-pine" href="/login">
            Sign in
          </Link>
        </p>
      </main>
    </>
  );
}
