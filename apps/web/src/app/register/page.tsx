import Link from "next/link";
import { AuthLinks, AuthForm } from "../../components/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";
import { LegalLinksInline } from "../../components/legal/legal-nav";

export default function RegisterPage() {
  return (
    <AuthShell
      footer={
        <div className="space-y-3">
          <AuthLinks links={[{ href: "/login", label: "Already registered? Sign in" }]} />
          <LegalLinksInline />
        </div>
      }
    >
      <AuthForm
        title="Create your account"
        subtitle="Verify your email after registering, then sign in to open a workspace."
        actionPath="/auth/register"
        submitLabel="Create account"
        onSuccessMessage="Account created. Check your email for a verification link, then sign in."
        fields={[
          { name: "name", label: "Full name", autoComplete: "name" },
          { name: "email", label: "Work email", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "new-password",
            minLength: 12,
          },
        ]}
        belowSubmit={
          <p className="mt-3 text-center text-xs leading-relaxed text-muted">
            Draft policies for review (not yet mandatory consent):{" "}
            <Link href="/legal/terms" className="text-emerald no-underline hover:underline">
              Terms
            </Link>
            ,{" "}
            <Link href="/legal/privacy" className="text-emerald no-underline hover:underline">
              Privacy
            </Link>
            , and{" "}
            <Link
              href="/legal/financial-disclaimers"
              className="text-emerald no-underline hover:underline"
            >
              financial disclaimers
            </Link>
            .
          </p>
        }
      />
    </AuthShell>
  );
}
