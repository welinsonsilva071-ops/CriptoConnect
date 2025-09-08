import { users } from "@/lib/data";
import AiSummaryCard from "@/components/profile/ai-summary-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { UserPlus } from "lucide-react";


export default function RightSidebar() {
  const currentUser = users[0];
  // Filter out the current user from suggestions
  const usersToSummarize = users.filter(u => u.id !== currentUser.id).slice(0, 2);
  const usersToFollow = users.filter(u => u.id !== currentUser.id);

  return (
    <div className="sticky top-4 flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI-Powered Summaries</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {usersToSummarize.map(user => (
            <AiSummaryCard key={user.id} user={user} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Who to follow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {usersToFollow.map(user => (
            <div key={user.id} className="flex items-center justify-between">
              <Link href={`/${user.username}`} className="flex items-center gap-3 group">
                <Avatar>
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="overflow-hidden">
                  <p className="font-semibold truncate group-hover:underline">{user.name}</p>
                  <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
                </div>
              </Link>
              <Button size="sm" variant="outline" className="shrink-0">
                <UserPlus className="mr-2 h-4 w-4"/>
                Follow
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
