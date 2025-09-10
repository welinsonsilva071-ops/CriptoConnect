import { get, ref } from 'firebase/database';
import { db } from './firebase';

export type User = {
  id: string; // This will be the Firebase UID
  name: string;
  username: string;
  avatar: string;
  bio: string;
  interests: string[];
  recentPosts: string[];
};

export type Post = {
  id: string;
  author: User;
  content: string;
  image?: string;
  link?: {
    url: string;
    title: string;
    description: string;
    image: string;
  };
  createdAt: string;
  likes: number;
  comments: number;
  reposts: number;
};

// This is now mock data. In a real app, this would come from the database.
export let users: User[] = [
  {
    id: 'user-1',
    name: 'Alice',
    username: 'alice',
    avatar: 'https://picsum.photos/id/1027/100/100',
    bio: 'Frontend developer and UI/UX enthusiast. I love building beautiful and accessible web applications. Coffee and code.',
    interests: ['React', 'Next.js', 'Design', 'Web Dev'],
    recentPosts: [
      'Just launched a new project with Next.js 14! The App Router is a game changer.',
      'Exploring the latest trends in UI/UX design. Minimalism is key!',
      'What are your favorite component libraries for React?',
    ],
  },
  {
    id: 'user-2',
    name: 'Bob',
    username: 'bob',
    avatar: 'https://picsum.photos/id/1005/100/100',
    bio: 'Blockchain expert and decentralization advocate. Exploring the future of web3 and digital currencies.',
    interests: ['Crypto', 'Ethereum', 'DeFi', 'Solidity'],
    recentPosts: [
      'The potential of ZK-proofs in scaling Ethereum is immense. Bullish!',
      'My thoughts on the latest DeFi protocol and its tokenomics.',
      'Just finished a deep dive into smart contract security. So many pitfalls to avoid.',
    ],
  },
    {
    id: 'user-3',
    name: 'Charlie',
    username: 'charlie',
    avatar: 'https://picsum.photos/id/1011/100/100',
    bio: 'Photographer and world traveler. Capturing moments and telling stories through my lens.',
    interests: ['Photography', 'Travel', 'Art', 'Nature'],
    recentPosts: [
      'Golden hour in the Swiss Alps. Unforgettable!',
      'My new photo series on urban landscapes is finally out.',
      'Tips for aspiring travel photographers: always pack light!',
    ],
  },
];

export const posts: Post[] = [
  {
    id: 'post-1',
    author: users[0],
    content: 'Just finished setting up my new workspace. A clean setup is a productive setup! What do you think?',
    image: 'https://picsum.photos/seed/post1/600/400',
    createdAt: '2h ago',
    likes: 128,
    comments: 12,
    reposts: 5,
  },
  {
    id: 'post-2',
    author: users[1],
    content: 'Fascinating read on the evolution of Layer 2 solutions for crypto scaling. The ecosystem is maturing so fast. Highly recommend this article.',
    link: {
      url: 'https://example.com',
      title: 'The Ultimate Guide to Layer 2 Scaling Solutions',
      description: 'An in-depth analysis of rollups, sidechains, and state channels.',
      image: 'https://picsum.photos/seed/link2/600/400'
    },
    createdAt: '5h ago',
    likes: 256,
    comments: 45,
    reposts: 23,
  },
    {
    id: 'post-3',
    author: users[2],
    content: 'A quiet moment from my trip to Kyoto last spring. The tranquility of the bamboo forest was surreal. 🌸',
    image: 'https://picsum.photos/seed/post3/600/400',
    createdAt: '1d ago',
    likes: 1024,
    comments: 88,
    reposts: 112,
  },
  {
    id: 'post-4',
    author: users[0],
    content: 'Working on a new UI concept for CriptoConnect. Playing with some soft blues and oranges. What a combo! #UIUX #Design',
    createdAt: '2d ago',
    likes: 98,
    comments: 20,
    reposts: 9,
  },
];


// This function is no longer needed for the main layout as we now use onValue, but can be useful elsewhere.
export async function getUserFromDatabase(uid: string) {
  const userRef = ref(db, `users/${uid}`);
  const snapshot = await get(userRef);
  if (snapshot.exists()) {
    const userData = snapshot.val();
    return { ...userData, id: uid };
  }
  return null;
}

// Update the mock data functions to also check the database if needed,
// or transition fully to database calls. For now, we'll keep the mock data
// and add the database functions.

export const findUserByUsername = (username: string) => users.find(u => u.username === username);
export const findUserByUid = (uid: string) => users.find(u => u.id === uid);
export const findPostsByUsername = (username: string) => posts.filter(p => p.author.username === username);
