import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Send, Search, Users, X } from 'lucide-react';
import { Card } from '../components/UI';
import { DirectMessage } from '../types';
import { getConversation, sendDirectMessage, getConversations, markMessageAsRead } from '../services/social';
import { formatDistanceToNow } from 'date-fns';

export const Messages: React.FC = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { theme, user } = useApp();
  const [conversations, setConversations] = useState<DirectMessage[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (userId && user) {
      loadConversation();
    } else {
      loadConversations();
    }
  }, [userId, user]);

  const loadConversations = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const convos = await getConversations(user.id);
      setConversations(convos);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async () => {
    if (!userId || !user) return;
    setIsLoading(true);
    try {
      const msgs = await getConversation(user.id, userId);
      setMessages(msgs);
      
      // Mark unread messages as read
      msgs.forEach(msg => {
        if (msg.recipientId === user.id && !msg.readAt) {
          markMessageAsRead(msg.id, user.id).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Error loading conversation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !userId || !user) return;
    
    try {
      const newMessage = await sendDirectMessage(user.id, userId, input);
      setMessages(prev => [...prev, newMessage]);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const getConversationPartner = (conversation: DirectMessage) => {
    if (!user) return null;
    return conversation.senderId === user.id ? conversation.recipient : conversation.sender;
  };

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const partner = getConversationPartner(conv);
    return partner?.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           partner?.username.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (userId) {
    // Show conversation view
    const conversationPartner = messages[0]?.senderId === user?.id 
      ? messages[0]?.recipient 
      : messages[0]?.sender;

    return (
      <div className="absolute inset-0 z-[100] flex flex-col" style={{ backgroundColor: theme.background }}>
        {/* Header */}
        <header className="px-6 pt-12 pb-4 flex items-center justify-between border-b" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/messages')} className="p-2">
              <ChevronLeft size={24} />
            </button>
            {conversationPartner && (
              <div className="flex items-center gap-3">
                <img 
                  src={conversationPartner.avatarUrl} 
                  className="w-10 h-10 rounded-2xl border-2"
                  style={{ borderColor: theme.border }}
                  alt={conversationPartner.displayName}
                />
                <div>
                  <h2 className="text-sm font-black uppercase italic tracking-tight">
                    {conversationPartner.displayName}
                  </h2>
                  <span className="text-[9px] opacity-50">@{conversationPartner.username}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 flex flex-col-reverse">
          <div className="space-y-6">
            {messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              const sender = isMe ? user : msg.sender;
              
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {!isMe && sender && (
                    <img 
                      src={sender.avatarUrl} 
                      className="w-8 h-8 rounded-full border border-white/10" 
                      alt={sender.displayName}
                    />
                  )}
                  <div className="max-w-[75%] space-y-1">
                    {!isMe && sender && (
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-30 ml-2">
                        {sender.displayName}
                      </p>
                    )}
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm font-medium ${isMe ? 'rounded-br-none' : 'rounded-bl-none'}`}
                      style={{
                        backgroundColor: isMe ? theme.accent : theme.surface,
                        color: isMe ? (theme.background === '#FFFFFF' ? '#FFF' : '#000') : theme.text,
                        border: `1px solid ${theme.border}`
                      }}
                    >
                      {msg.message}
                    </div>
                    <p className={`text-[8px] opacity-20 font-bold ${isMe ? 'text-right mr-2' : 'ml-2'}`}>
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Input */}
        <div className="p-6 pb-10 border-t" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-2 pl-4 border border-white/5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="flex-1 bg-transparent outline-none text-sm font-medium"
              style={{ color: theme.text }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-3 rounded-xl transition-all active:scale-90 disabled:opacity-30"
              style={{ backgroundColor: theme.accent }}
            >
              <Send size={18} color={theme.background === '#FFFFFF' ? '#FFF' : '#000'} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show conversations list
  return (
    <div className="pb-20">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b" style={{ borderColor: theme.border }}>
        <h2 className="text-2xl font-black uppercase italic tracking-tighter">Messages</h2>
        <button className="p-2 opacity-40">
          <Users size={20} />
        </button>
      </div>

      {/* Search */}
      <div className="px-6 pt-4 pb-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-12 pr-4 py-3 rounded-2xl outline-none text-sm"
            style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="px-6 py-20 text-center opacity-40">
            <p className="text-sm font-black uppercase tracking-widest">Loading...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="px-6 py-20 text-center opacity-40">
            <p className="text-sm font-black uppercase tracking-widest">No conversations yet</p>
            <p className="text-xs mt-2 opacity-60">Start a conversation from someone's profile</p>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const partner = getConversationPartner(conversation);
            if (!partner) return null;

            return (
              <Link
                key={conversation.id}
                to={`/messages/${partner.id}`}
                className="block px-6 py-4 border-b active:bg-white/5 transition-colors"
                style={{ borderColor: theme.border }}
              >
                <div className="flex items-center gap-4">
                  <img
                    src={partner.avatarUrl}
                    className="w-12 h-12 rounded-2xl border-2"
                    style={{ borderColor: theme.border }}
                    alt={partner.displayName}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-black uppercase italic tracking-tight truncate">
                        {partner.displayName}
                      </span>
                      <span className="text-[8px] opacity-40 ml-2">
                        {formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs opacity-60 truncate">{conversation.message}</p>
                  </div>
                  {conversation.recipientId === user?.id && !conversation.readAt && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.accent }} />
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
};
