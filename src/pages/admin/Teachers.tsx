import { TeachersPanel } from './AdminSettings';
import { PageHeader } from '../../components/ui';

export default function Teachers() {
  return (
    <div className="space-y-5">
      <PageHeader title="Teachers" subtitle="Everyone who teaches, with their classes and subjects. A teacher signs in with the email shown here." />
      <TeachersPanel />
    </div>
  );
}
