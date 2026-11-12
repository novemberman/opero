import { AuthForm } from "../../components/auth-form";
import { SiteHeader } from "../../components/site-header";

export default function ForgotPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <AuthForm
          title="Forgot password"
          subtitle="If an account exists, a reset message is written to the development mail directory."
          actionPath="/auth/forgot-password"
          submitLabel="Send reset link"
          onSuccessMessage="If that email is registered, a reset message was queued."
          fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        />
      </main>
    </>
  );
}
