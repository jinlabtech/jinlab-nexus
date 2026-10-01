import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | JINLAB Nexus",
  description:
    "Terms of Service for JINLAB Nexus.",
};

const sections = [
  {
    title: "1. About JINLAB Nexus",
    text:
      "JINLAB Nexus is a business operating platform developed by JINLAB Technology. Nexus may provide tools for operations, customers, inventory, repairs, sales, invoicing, accounting, payroll, reporting, communications, human resources and other business functions.",
  },
  {
    title: "2. Accounts and access",
    text:
      "Users must provide accurate account information and protect their login credentials. Access to a Nexus organisation workspace depends on the permissions, role and membership assigned to that user. An authenticated account does not automatically grant access to any company or organisation.",
  },
  {
    title: "3. Organisation administrators",
    text:
      "An organisation administrator may invite users, assign roles, control permissions and manage access to organisation data. Organisations are responsible for deciding who is authorised to access their workspace and for reviewing access when staff roles change or employment ends.",
  },
  {
    title: "4. Acceptable use",
    text:
      "Nexus may not be used to unlawfully access information, impersonate another person, interfere with system security, distribute malicious software, commit fraud, abuse communications services or process information in a way that violates applicable law or another person's rights.",
  },
  {
    title: "5. Customer and business data",
    text:
      "The organisation using Nexus remains responsible for the accuracy, lawfulness and appropriate use of the business information it enters into the platform. Users should only upload or process information that they are authorised to use.",
  },
  {
    title: "6. Third-party services",
    text:
      "Nexus may integrate with third-party services such as authentication providers, email systems, messaging services, payment providers, cloud infrastructure and other business tools. Those services may have their own terms and privacy practices, and their availability may affect related Nexus features.",
  },
  {
    title: "7. Subscriptions and paid services",
    text:
      "Some Nexus functions may require a paid subscription, add-on or usage-based service. Applicable pricing, billing terms and included features may be presented separately before purchase or activation.",
  },
  {
    title: "8. Availability and changes",
    text:
      "JINLAB aims to provide a reliable service, but Nexus may occasionally be unavailable because of maintenance, internet failures, third-party outages, security incidents or other technical conditions. Features may be improved, replaced or discontinued as the platform develops.",
  },
  {
    title: "9. Security responsibilities",
    text:
      "Users and organisations must take reasonable steps to protect their accounts, devices and credentials. Suspected unauthorised access should be reported to JINLAB promptly. JINLAB may restrict or suspend access when reasonably necessary to protect users, organisations or the platform.",
  },
  {
    title: "10. Suspension and termination",
    text:
      "JINLAB may suspend or terminate access where these terms are materially breached, payment obligations are not met, use creates a security or legal risk, or continued access could harm Nexus or another user. Organisations may also end their use of Nexus subject to applicable subscription or contractual terms.",
  },
  {
    title: "11. Intellectual property",
    text:
      "JINLAB Nexus, including its software, interfaces, branding, documentation and platform technology, remains the property of JINLAB or its licensors. Customers retain rights in the business information and content they lawfully place in their workspace.",
  },
  {
    title: "12. Responsibility and limitations",
    text:
      "Nexus is intended to assist organisations with business operations. Users remain responsible for important business, financial, employment, tax, regulatory and professional decisions. Nothing in these terms excludes rights or responsibilities that cannot lawfully be excluded.",
  },
  {
    title: "13. Privacy",
    text:
      "Personal information handled through Nexus is also subject to the JINLAB Nexus Privacy Policy. Organisations using Nexus remain responsible for their own obligations regarding the personal information they collect and control.",
  },
  {
    title: "14. Governing law",
    text:
      "These terms are governed by the laws of the Republic of South Africa, subject to any mandatory rights or protections that apply to the relevant customer or user.",
  },
  {
    title: "15. Changes to these terms",
    text:
      "JINLAB may update these terms as Nexus evolves. Material changes may be communicated through Nexus or other appropriate channels. Continued use after an updated version takes effect may be subject to the updated terms.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link
            href="/login"
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 font-black text-white">
              J
            </div>

            <div>
              <div className="font-extrabold tracking-wide">
                JINLAB Nexus
              </div>

              <div className="text-xs text-slate-500">
                Business Operating System
              </div>
            </div>
          </Link>

          <Link
            href="/login"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">
          JINLAB Nexus
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
          Terms of Service
        </h1>

        <p className="mt-5 text-base leading-7 text-slate-600">
          These terms describe the conditions for
          accessing and using JINLAB Nexus.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
          <strong>
            Effective date:
          </strong>{" "}
          30 September 2026
        </div>

        <div className="mt-10 space-y-10">
          {sections.map(
            (section) => (
              <section
                key={section.title}
              >
                <h2 className="text-xl font-bold tracking-tight">
                  {section.title}
                </h2>

                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {section.text}
                </p>
              </section>
            )
          )}
        </div>

        <div className="mt-12 border-t border-slate-200 pt-8">
          <p className="text-sm text-slate-500">
            Questions about these terms can be
            sent to{" "}
            <a
              href="mailto:jinlabtech@gmail.com"
              className="font-semibold text-blue-600"
            >
              jinlabtech@gmail.com
            </a>
            .
          </p>

          <div className="mt-5 flex flex-wrap gap-5 text-sm font-semibold">
            <Link
              href="/privacy"
              className="text-blue-600 hover:text-blue-700"
            >
              Privacy Policy
            </Link>

            <Link
              href="/login"
              className="text-slate-600 hover:text-slate-950"
            >
              Return to Nexus
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
