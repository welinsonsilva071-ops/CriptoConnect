
import { db } from './firebase';
import { ref, set, get, serverTimestamp, update } from 'firebase/database';

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
      // Chat doesn't exist, create it with all necessary data atomically.
      // We use `update` to set data at multiple paths at once.
      const updates: { [key: string]: any } = {};
      updates[`/chats/${chatId}`] = {
        members: {
          [currentUserId]: true,
          [otherUserId]: true,
        },
        createdAt: serverTimestamp(),
      };
      updates[`/users/${currentUserId}/chats/${chatId}`] = true;
      updates[`/users/${otherUserId}/chats/${chatId}`] = true;

      await update(ref(db), updates);
    }
    // If chat already exists, we just return the ID, assuming the user already has access.
    
    return chatId;

  } catch (error) {
    console.error("Error starting chat:", error);
    // Check if the error is a permission denied error
    if ((error as any).code === 'PERMISSION_DENIED') {
        throw new Error("Você não tem permissão para iniciar esta conversa. Verifique as regras de segurança do seu banco de dados.");
    }
    throw new Error("Não foi possível iniciar a sessão de conversa.");
  }
};

export default startChat;
