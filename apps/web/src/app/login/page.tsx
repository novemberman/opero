import Link from "next/link";
import { AuthForm } from "../../components/auth-form";
import { SiteHeader } from "../../components/site-header";

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <AuthForm
          title="Sign in"
          subtitle="Use your verified Opero account."
          actionPath="/auth/login"
          submitLabel="Sign in"
          successRedirect="/organizations"
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            {
              name: "password",
              label: "Password",
              type: "password",
              autoComplete: "current-password",
            },
          ]}
        />
        <p className="mx-auto mt-6 max-w-md space-x-3 text-sm text-muted">
          <Link className="text-pine" href="/register">
            Create account
          </Link>
          <Link className="text-pine" href="/forgot-password">
            Forgot password
          </Link>
        </p>
      </main>
    </>
  );
}
