"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import LeftSidebar from "@/components/layout/left-sidebar";
import RightSidebar from "@/components/layout/right-sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      } else if (!user.emailVerified) {
         router.push('/auth/verify-email');
      } else if (!user.displayName) {
        router.push('/complete-profile');
      }
    });

    return () => unsubscribe();
  }, [router]);


  if (!auth.currentUser || !auth.currentUser.emailVerified || !auth.currentUser.displayName) {
      return (
         <div className="flex items-center justify-center min-h-screen">
            Carregando...
         </div>
      )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto grid grid-cols-1 md:grid-cols-12 gap-8">
        <aside className="hidden md:block md:col-span-3 xl:col-span-2 py-4">
          <LeftSidebar />
        </aside>
        <main className="col-span-1 md:col-span-9 xl:col-span-7 border-x border-border min-h-screen">
          {children}
        </main>
        <aside className="hidden lg:block lg:col-span-3 py-4">
          <RightSidebar />
        </aside>
      </div>
    </div>
  );
}
