import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | JINLAB Nexus",
  description:
    "Privacy Policy for JINLAB Nexus.",
};

const sections = [
  {
    title: "1. Information we collect",
    body: (
      <>
        <p>
          Depending on how you use JINLAB Nexus,
          we may process information such as your
          name, email address, telephone number,
          organisation details, account details,
          role and permissions, business records,
          customer information, inventory records,
          repair information, invoices, payroll or
          operational records, device and security
          information, and records created while
          using Nexus.
        </p>

        <p>
          When you use Google, Apple or another
          identity provider to sign in, we may
          receive basic account information made
          available by that provider, such as your
          email address, account identifier and
          profile information.
        </p>
      </>
    ),
  },
  {
    title: "2. How we use information",
    body: (
      <>
        <p>
          We use information to provide and secure
          Nexus, authenticate users, manage
          organisation workspaces, deliver business
          features, maintain records, provide
          customer support, prevent fraud and abuse,
          improve reliability, communicate important
          service information and meet applicable
          legal or operational requirements.
        </p>

        <p>
          We do not use Google sign-in to obtain
          access to a user&apos;s Google password.
          Authentication credentials are handled by
          the relevant identity provider.
        </p>
      </>
    ),
  },
  {
    title: "3. Organisation data",
    body: (
      <p>
        Businesses and organisations using Nexus
        control the records they place in their
        workspace. Access to organisation data is
        controlled through Nexus accounts, roles,
        permissions and other security controls.
        Users should only access information they
        are authorised to use.
      </p>
    ),
  },
  {
    title: "4. Sharing and service providers",
    body: (
      <p>
        We may use trusted technology and service
        providers to operate Nexus, including cloud
        infrastructure, authentication, email,
        communications, payment, monitoring and
        security services. Information is shared
        only where reasonably necessary to provide
        those services, protect Nexus, comply with
        lawful obligations, or where the relevant
        user or organisation has authorised it.
      </p>
    ),
  },
  {
    title: "5. Marketing communications",
    body: (
      <p>
        Transactional or service communications are
        separate from marketing. Where marketing
        consent is required, Nexus should record
        that choice separately. Users may withdraw
        marketing consent using the available
        unsubscribe method or by contacting JINLAB.
      </p>
    ),
  },
  {
    title: "6. Data retention",
    body: (
      <p>
        Information is retained for as long as it
        is reasonably required to provide Nexus,
        preserve legitimate business and audit
        records, resolve disputes, maintain security
        and meet applicable legal or regulatory
        obligations. Retention periods may differ
        depending on the type of information and
        the organisation using Nexus.
      </p>
    ),
  },
  {
    title: "7. Security",
    body: (
      <p>
        JINLAB uses technical and organisational
        safeguards intended to protect Nexus,
        including authentication, access controls,
        permission management, audit mechanisms and
        infrastructure security. No online service
        can guarantee absolute security, so users
        must also protect their passwords, devices
        and account access.
      </p>
    ),
  },
  {
    title: "8. Your privacy choices",
    body: (
      <>
        <p>
          Depending on applicable law and the
          relationship between you, JINLAB and the
          organisation controlling your workspace,
          you may be able to request access,
          correction or deletion of personal
          information, object to certain processing,
          withdraw consent or ask questions about
          how information is handled.
        </p>

        <p>
          Requests can be sent to{" "}
          <a
            href="mailto:jinlabtech@gmail.com"
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            jinlabtech@gmail.com
          </a>
          . We may need to verify your identity
          before completing a request.
        </p>
      </>
    ),
  },
  {
    title: "9. Account and data deletion",
    body: (
      <p>
        To request deletion of a Nexus account or
        personal information associated with it,
        contact JINLAB at{" "}
        <a
          href="mailto:jinlabtech@gmail.com"
          className="font-semibold text-blue-600 hover:text-blue-700"
        >
          jinlabtech@gmail.com
        </a>
        . Some business, financial, security, audit
        or statutory records may need to be retained
        after an account is closed.
      </p>
    ),
  },
  {
    title: "10. International and cloud processing",
    body: (
      <p>
        Nexus may use cloud or technology providers
        whose systems operate in more than one
        country. Where information is processed
        outside South Africa, JINLAB and its service
        providers should use appropriate contractual,
        technical and organisational safeguards
        where required.
      </p>
    ),
  },
  {
    title: "11. Children",
    body: (
      <p>
        Nexus is primarily a business and
        organisational platform. Where an
        organisation uses Nexus in an educational
        environment involving children, that
        organisation is responsible for ensuring
        that its use of personal information is
        authorised and appropriate for that
        environment.
      </p>
    ),
  },
  {
    title: "12. Changes to this policy",
    body: (
      <p>
        We may update this Privacy Policy as Nexus
        develops, legal requirements change or new
        services are introduced. The current version
        will be published on this page with its
        effective date.
      </p>
    ),
  },
];

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>

        <p className="mt-5 text-base leading-7 text-slate-600">
          This policy explains how JINLAB Technology
          handles personal information when people
          use JINLAB Nexus and related services.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="font-semibold">
                Effective date:
              </span>{" "}
              30 September 2026
            </div>

            <div>
              <span className="font-semibold">
                Contact:
              </span>{" "}
              jinlabtech@gmail.com
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-10">
          {sections.map(
            (section) => (
              <section
                key={section.title}
                className="space-y-3"
              >
                <h2 className="text-xl font-bold tracking-tight">
                  {section.title}
                </h2>

                <div className="space-y-3 text-sm leading-7 text-slate-600">
                  {section.body}
                </div>
              </section>
            )
          )}
        </div>

        <div className="mt-12 border-t border-slate-200 pt-8">
          <p className="text-sm text-slate-500">
            For questions about this policy or
            privacy requests, email{" "}
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
              href="/terms"
              className="text-blue-600 hover:text-blue-700"
            >
              Terms of Service
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
