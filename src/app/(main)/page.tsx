import { posts } from '@/lib/data';
import PostCard from '@/components/posts/post-card';
import CreatePostForm from '@/components/posts/create-post-form';

export default function HomePage() {
  return (
    <div>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border">
        <h2 className="text-xl font-bold">Home</h2>
      </header>

      <div className="p-4 border-b border-border">
        <CreatePostForm />
      </div>

      <section>
        {posts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}
      </section>
    </div>
  );
}
