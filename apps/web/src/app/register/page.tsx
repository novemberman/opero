import { AuthLinks, AuthForm } from "../../components/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";

export default function RegisterPage() {
  return (
    <AuthShell
      footer={
        <AuthLinks links={[{ href: "/login", label: "Already registered? Sign in" }]} />
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
      />
    </AuthShell>
  );
}
