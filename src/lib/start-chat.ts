
import { db } from './firebase';
import { ref, set, push, get, serverTimestamp } from 'firebase/database';

// Function to create a unique chat ID for two users
const createChatId = (uid1: string, uid2: string) => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

const startChat = async (currentUserId: string, otherUserId: string): Promise<string> => {
  const chatId = createChatId(currentUserId, otherUserId);
  const chatRef = ref(db, `chats/${chatId}`);

  try {
    const chatSnapshot = await get(chatRef);

    if (!chatSnapshot.exists()) {
      // Chat doesn't exist, create it
      await set(chatRef, {
        members: {
          [currentUserId]: true,
          [otherUserId]: true,
        },
        createdAt: serverTimestamp(),
      });
      
      // Add chat reference to both users' profiles
      const currentUserChatRef = ref(db, `users/${currentUserId}/chats/${chatId}`);
      await set(currentUserChatRef, true);
      
      const otherUserChatRef = ref(db, `users/${otherUserId}/chats/${chatId}`);
      await set(otherUserChatRef, true);
    }
     // If chat already exists, we just return the ID
    
    return chatId;

  } catch (error) {
    console.error("Error starting chat:", error);
    throw new Error("Could not initiate chat session.");
  }
};

export default startChat;
