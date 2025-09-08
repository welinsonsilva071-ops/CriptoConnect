import { findUserByUsername, findPostsByUsername } from '@/lib/data';
import { notFound } from 'next/navigation';
import ProfileHeader from '@/components/profile/profile-header';
import PostCard from '@/components/posts/post-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ProfilePage({ params }: { params: { username: string } }) {
  const user = findUserByUsername(params.username);
  if (!user) {
    notFound();
  }
  const userPosts = findPostsByUsername(params.username);

  return (
    <div>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border">
        <h2 className="text-xl font-bold">{user.name}</h2>
        <p className="text-sm text-muted-foreground">{userPosts.length} posts</p>
      </header>

      <ProfileHeader user={user} />
      
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-transparent border-b rounded-none">
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="replies">Replies</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="likes">Likes</TabsTrigger>
        </TabsList>
        <TabsContent value="posts">
          {userPosts.length > 0 ? (
            userPosts.map(post => <PostCard key={post.id} post={post} />)
          ) : (
            <p className="text-center text-muted-foreground p-8">No posts yet.</p>
          )}
        </TabsContent>
        <TabsContent value="replies"><p className="text-center text-muted-foreground p-8">No replies yet.</p></TabsContent>
        <TabsContent value="media"><p className="text-center text-muted-foreground p-8">No media yet.</p></TabsContent>
        <TabsContent value="likes"><p className="text-center text-muted-foreground p-8">No likes yet.</p></TabsContent>
      </Tabs>
    </div>
  );
}
