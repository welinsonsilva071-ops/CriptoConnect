import LeftSidebar from "@/components/layout/left-sidebar";
import RightSidebar from "@/components/layout/right-sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
