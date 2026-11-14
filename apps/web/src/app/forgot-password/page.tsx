import { AuthLinks, AuthForm } from "../../components/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";

export default function ForgotPasswordPage() {
  return (
    <AuthShell footer={<AuthLinks links={[{ href: "/login", label: "Back to sign in" }]} />}>
      <AuthForm
        title="Forgot password"
        subtitle="Enter the email on your Opero account. If it exists, we will send reset instructions."
        actionPath="/auth/forgot-password"
        submitLabel="Send reset link"
        onSuccessMessage="If that email is registered, password reset instructions are on the way."
        fields={[{ name: "email", label: "Work email", type: "email", autoComplete: "email" }]}
      />
    </AuthShell>
  );
}
