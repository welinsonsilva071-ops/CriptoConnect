"use client";

import { useState, useEffect } from 'react';
import { type User } from '@/lib/data';
import { generateProfileSummary, type GenerateProfileSummaryOutput } from '@/ai/flows/generate-profile-summary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function AiSummaryCard({ user }: { user: User }) {
  const [summary, setSummary] = useState<GenerateProfileSummaryOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const result = await generateProfileSummary({
          bio: user.bio,
          recentPosts: user.recentPosts,
        });
        setSummary(result);
      } catch (e) {
        console.error(e);
        toast({
          variant: "destructive",
          title: "AI Error",
          description: "Could not generate profile summary.",
        })
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [user, toast]);

  return (
    <Card className="bg-card/50 transition-all hover:shadow-md">
      <CardHeader>
        <div className="flex items-start gap-4">
          <Link href={`/${user.username}`}>
            <Avatar>
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
            </Avatar>
          </Link>
          <div className='overflow-hidden'>
            <CardTitle className="text-base truncate">
              <Link href={`/${user.username}`} className="hover:underline">{user.name}</Link>
            </CardTitle>
            <CardDescription>@{user.username}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[80%]" />
          </div>
        ) : (
          summary && <p className="text-sm text-muted-foreground">{summary.summary}</p>
        )}
      </CardContent>
    </Card>
  );
}
