import { AuthForm } from "../../../components/auth-form";
import { SiteHeader } from "../../../components/site-header";

export default function NewOrganizationPage() {
  return (
    <>
      <SiteHeader mark="Organizations" />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <AuthForm
          title="Create organization"
          subtitle="You become the OWNER of the new tenant."
          actionPath="/organizations"
          submitLabel="Create"
          successRedirect="/organizations"
          fields={[
            { name: "name", label: "Name", autoComplete: "organization" },
            { name: "slug", label: "Slug (lowercase-hyphenated)", autoComplete: "off" },
          ]}
        />
      </main>
    </>
  );
}
