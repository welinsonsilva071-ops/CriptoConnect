export default function NotificationsPage() {
  return (
    <div>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border">
        <h2 className="text-xl font-bold">Notifications</h2>
      </header>
      <div className="flex justify-center items-center h-96">
        <p className="text-muted-foreground">No notifications yet.</p>
      </div>
    </div>
  )
}
