import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  BackHandler
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, where, getDocs, doc, getDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDnRc9A8OusZtaq2J5JmYqV_9O1U8clUx0",
  authDomain: "family-chat-app-493c8.firebaseapp.com",
  projectId: "family-chat-app-493c8",
  storageBucket: "family-chat-app-493c8.firebasestorage.app",
  messagingSenderId: "772016782310",
  appId: "1:772016782310:web:7f7b968865a156bf17b427",
  measurementId: "G-KR9HTGSYJ6"
};

const app = initializeApp(firebaseConfig);

// Função para gerar chatId (mantida caso precise futuramente)
const generateChatId = (userId1, userId2) => {
  const sorted = [userId1, userId2].sort();
  return `${sorted[0]}_${sorted[1]}`;
};

// Configurar Auth com persistência do AsyncStorage
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

const db = getFirestore(app, 'f007');

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [userInfo, setUserInfo] = useState(null);
  const [messagesUnsubscribe, setMessagesUnsubscribe] = useState(null);
  const flatListRef = React.useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await loadUserInfo(currentUser.uid);
        setScreen('chats');
        loadChats(currentUser);
      } else {
        // Limpar todos os estados quando não há usuário
        setUser(null);
        setUserInfo(null);
        setChats([]);
        setMessages([]);
        setSelectedChat(null);
        setScreen('login');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ✅ BackHandler corrigido - só para Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const backAction = () => {
      if (screen === 'chat') {
        handleBackToChats();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [screen]);

  const loadUserInfo = async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        setUserInfo(userDoc.data());
      }
    } catch (error) {
      console.error('Erro ao carregar info do usuário:', error);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert('Erro no login: ' + error.message);
    }
  };

  // ✅ Logout corrigido
  const handleLogout = async () => {
    try {
      // Limpar listener de mensagens se existir
      if (messagesUnsubscribe) {
        messagesUnsubscribe();
        setMessagesUnsubscribe(null);
      }

      // Limpar estados antes do signOut
      setChats([]);
      setMessages([]);
      setSelectedChat(null);
      setUserInfo(null);
      setEmail('');
      setPassword('');
      
      // Fazer logout
      await signOut(auth);
      
      // O onAuthStateChanged vai cuidar de mudar a tela para 'login'
    } catch (error) {
      console.error('Erro no logout:', error);
      alert('Erro ao sair: ' + error.message);
    }
  };

  // Carregar apenas o chat do grupo familiar
  const loadChats = async (currentUser) => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const allUsers = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const familyChat = {
        id: 'family-group',
        name: 'Família 👨‍👩‍👧‍👦',
        type: 'group',
        participants: allUsers.map(u => u.id)
      };

      setChats([familyChat]);
    } catch (error) {
      console.error('Erro ao carregar chats:', error);
      alert('Erro ao carregar chats: ' + error.message);
    }
  };

  const openChat = (chat) => {
    setSelectedChat(chat);
    setScreen('chat');

    const chatId = chat.type === 'group'
      ? 'family-group'
      : generateChatId(chat.participants[0], chat.participants[1]);

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      orderBy('timestamp', 'asc')
    );

    // Limpar listener anterior se existir
    if (messagesUnsubscribe) {
      messagesUnsubscribe();
    }

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(msgs);
      },
      (error) => {
        console.error('Erro ao carregar mensagens:', error);
        alert('Erro de permissão. Verifique as regras do Firestore.');
      }
    );

    setMessagesUnsubscribe(() => unsubscribe);
  };

  // ✅ Função para voltar aos chats
  const handleBackToChats = () => {
    // Limpar listener de mensagens
    if (messagesUnsubscribe) {
      messagesUnsubscribe();
      setMessagesUnsubscribe(null);
    }
    
    setMessages([]);
    setSelectedChat(null);
    setScreen('chats');
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const chatId = selectedChat.type === 'group'
      ? 'family-group'
      : generateChatId(selectedChat.participants[0], selectedChat.participants[1]);

    try {
      await addDoc(collection(db, 'messages'), {
        chatId: chatId,
        text: newMessage,
        userId: user.uid,
        userName: userInfo?.displayName || user.email.split('@')[0],
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro ao enviar: ' + error.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  if (screen === 'login') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginContainer}>
          <Text style={styles.title}>Chat da Família 👨‍👩‍👧‍👦</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          
          <TextInput
            style={styles.input}
            placeholder="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Entrar</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            Digite seu E-mail e Senha Familiar
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'chats') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Conversas</Text>
            {userInfo && (
              <Text style={styles.userSubtitle}>
                Olá, {userInfo.displayName || user?.email?.split('@')[0]} 👋
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutButton}>Sair</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.chatItem}
              onPress={() => openChat(item)}
            >
              <Text style={styles.chatName}>{item.name}</Text>
              <Text style={styles.chatType}>
                {item.type === 'group' ? 'Grupo' : 'Individual'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  if (screen === 'chat') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity 
            onPress={handleBackToChats}
            style={styles.backButtonTouchable}
            activeOpacity={0.7}
          >
            <Text style={styles.backButton}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.chatHeaderTitle}>{selectedChat?.name}</Text>
          <View style={{ width: 70 }} />
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            renderItem={({ item }) => {
              const isMe = item.userId === user.uid;
              return (
                <View style={[
                  styles.messageContainer,
                  isMe ? styles.myMessage : styles.otherMessage
                ]}>
                  {!isMe && <Text style={styles.senderName}>{item.userName}</Text>}

                  <Text style={[styles.messageText, isMe && styles.myMessageText]}>
                    {item.text}
                  </Text>

                  <Text style={[styles.messageTime, isMe && styles.myMessageTime]}>
                    {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : ''}
                  </Text>
                </View>
              );
            }}
            onContentSizeChange={() => {
              if (messages.length > 0) {
                setTimeout(() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }
            }}
            ref={flatListRef}
          />

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.messageInput}
              placeholder="Escreva uma mensagem..."
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
              <Text style={styles.sendButtonText}>Enviar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    textAlign: 'center',
    color: '#666',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  hint: {
    marginTop: 20,
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  userSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  logoutButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  chatItem: {
    backgroundColor: 'white',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chatName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  chatType: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    paddingBottom: 10,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  chatHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  backButtonTouchable: {
    width: 70,
    paddingVertical: 10,
  },
  backButton: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 15,
    marginVertical: 5,
    marginHorizontal: 10,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#e5e5ea',
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  myMessageText: {
    color: 'white',
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});