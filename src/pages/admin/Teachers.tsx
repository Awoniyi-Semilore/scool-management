import { TeachersPanel } from './AdminSettings';
import { PageHeader } from '../../components/ui';

export default function Teachers() {
  return (
    <div className="space-y-5">
      <PageHeader title="Teachers" subtitle="Manage teacher accounts, assigned classes and subjects. Teachers sign in with the email address shown here." />
      <TeachersPanel />
    </div>
  );
}
