
import { db } from './firebase';
import { ref, get, serverTimestamp, update } from 'firebase/database';

// Function to create a unique chat ID for two users
const createChatId = (uid1: string, uid2: string) => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

const startChat = async (currentUserId: string, otherUserId: string): Promise<string> => {
  const chatId = createChatId(currentUserId, otherUserId);
  
  try {
    // We will directly attempt an atomic update.
    // This operation will only fully succeed if permissions are met for all paths.
    // The security rules are set up to allow this initial write.
    const updates: { [key: string]: any } = {};
    const chatRef = ref(db, `chats/${chatId}`);
    const chatSnapshot = await get(chatRef);

    // Only create the chat structure if it doesn't exist
    if (!chatSnapshot.exists()) {
        updates[`/chats/${chatId}`] = {
            members: {
            [currentUserId]: true,
            [otherUserId]: true,
            },
            createdAt: serverTimestamp(),
        };
    }
    
    // Always ensure the chat link exists for both users
    updates[`/users/${currentUserId}/chats/${chatId}`] = true;
    updates[`/users/${otherUserId}/chats/${chatId}`] = true;

    await update(ref(db), updates);
    
    return chatId;

  } catch (error) {
    console.error("Error starting chat:", error);
    if ((error as any).code === 'PERMISSION_DENIED') {
        throw new Error("Você não tem permissão para iniciar esta conversa. Verifique as regras de segurança do seu banco de dados.");
    }
    throw new Error("Não foi possível iniciar a sessão de conversa.");
  }
};

export default startChat;
