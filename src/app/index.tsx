import { AppErrorBoundary } from '@/components/app-error-boundary';
import { CommutePingApp } from '@/features/commute/commute-ping-app';

export default function HomeScreen() {
  return (
    <AppErrorBoundary>
      <CommutePingApp />
    </AppErrorBoundary>
  );
}
