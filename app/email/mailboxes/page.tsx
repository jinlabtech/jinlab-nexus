import DashboardLayout from "@/components/layout/DashboardLayout";
import MailboxManagement from "@/components/email/MailboxManagement";

export default function EmailMailboxesPage() {
  return (
    <DashboardLayout>
      <MailboxManagement />
    </DashboardLayout>
  );
}
