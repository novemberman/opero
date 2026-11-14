import { AuthLinks, AuthForm } from "../../components/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell
      footer={
        <AuthLinks
          links={[
            { href: "/register", label: "Create account" },
            { href: "/forgot-password", label: "Forgot password" },
          ]}
        />
      }
    >
      <AuthForm
        title="Sign in"
        subtitle="Use your verified Opero account to open your organizations."
        actionPath="/auth/login"
        submitLabel="Sign in"
        successRedirect="/organizations"
        fields={[
          { name: "email", label: "Work email", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />
    </AuthShell>
  );
}
