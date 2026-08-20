import { Suspense } from 'react';
import { Library } from '@/components/layout/library';

export default function Home() {
  return (
    <Suspense fallback={<div className="h-dvh bg-background" />}>
      <Library />
    </Suspense>
  );
}
