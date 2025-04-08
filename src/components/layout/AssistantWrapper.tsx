"use client";

import { useState, useRef, useEffect } from 'react';
import { useUiContext } from '@/context/UiContext';
import { SendIcon, XIcon, Loader2, Expand, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/queries/useUser';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const AssistantWrapper = () => {
  const { isAssistantOpen, toggleAssistant, isAssistantFullScreen, toggleAssistantFullScreen } = useUiContext();
  const { data: currentUser } = useCurrentUser();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Welcome! I\'m your AI assistant. I can help you manage tasks, summarize work, and more. How can I help you today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  
  // Autofocus input when assistant opens
  useEffect(() => {
    if (isAssistantOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isAssistantOpen]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Handle sending a message
  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;
    
    const userMessage = input.trim();
    setInput('');
    
    // Add user message to the conversation
    const userMessageObj = { role: 'user', content: userMessage } as Message;
    setMessages(prev => [...prev, userMessageObj]);
    setIsProcessing(true);
    
    try {
      // Convert messages to the format expected by the API (exclude system message)
      const contextMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));
      
      // Send the message to the assistant API
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          context: contextMessages
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to communicate with assistant');
      }
      
      // Add assistant response to the conversation
      setMessages(prev => [
        ...prev, 
        { role: 'assistant', content: data.message } as Message
      ]);
      
      // If there was a function call, show a toast with the action performed
      if (data.functionCalled) {
        if (data.functionResult.error) {
          toast({
            title: 'Error',
            description: data.functionResult.error,
            variant: 'destructive'
          });
        } else {
          // Show success toast based on function type
          switch (data.functionCalled) {
            case 'createTask':
              toast({
                title: 'Task Created',
                description: `Created task: ${data.functionResult.task?.title || 'New task'}`,
              });
              break;
            case 'summarizeTasks':
              toast({
                title: 'Summary Generated',
                description: 'Task summary has been generated',
              });
              break;
            default:
              toast({
                title: 'Action Completed',
                description: `${data.functionCalled} was successfully executed`,
              });
          }
        }
      }
    } catch (error) {
      console.error('Error communicating with assistant:', error);
      
      // Add error message to conversation
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: 'Sorry, I encountered an error processing your request. Please try again.' 
        } as Message
      ]);
      
      toast({
        title: 'Error',
        description: 'Failed to communicate with the assistant',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Handle input keypress (Shift+Enter for new line, Enter to send)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Clear conversation
  const handleClearConversation = () => {
    setMessages([
      {
        role: 'system',
        content: 'Welcome! I\'m your AI assistant. I can help you manage tasks, summarize work, and more. How can I help you today?'
      }
    ]);
  };
  
  return (
    <aside 
      className={cn(
        "fixed bg-card border-l border-border transition-all duration-300 ease-in-out overflow-hidden shadow-lg z-50",
        isAssistantFullScreen ? 
          "inset-0 rounded-none" : 
          "right-0 top-16 bottom-0 z-50 border-l",
        isAssistantOpen ? 
          isAssistantFullScreen ? "w-full h-full" : "w-[400px]" : 
          "w-0"
      )}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 bg-white">
              <AvatarImage src="/collab.png" alt="AI Assistant" />
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-medium text-sm">AI Assistant</h3>
              <p className="text-xs text-muted-foreground">Powered by GPT</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 px-2"
              onClick={handleClearConversation}
            >
              Clear
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={toggleAssistantFullScreen}
              title={isAssistantFullScreen ? "Exit full screen" : "Full screen"}
            >
              {isAssistantFullScreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Expand className="h-4 w-4" />
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={toggleAssistant}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Messages area */}
        <div className="flex-grow overflow-y-auto">
          <div className={cn("p-4 space-y-4", isAssistantFullScreen && "max-w-4xl mx-auto")}>
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3 max-w-full",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8 mt-1 flex-shrink-0 bg-white">
                    <AvatarImage src="/collab.png" alt="AI Assistant" />
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                )}
                
                <div 
                  className={cn(
                    "rounded-lg px-3 py-2",
                    isAssistantFullScreen ? "max-w-[70%]" : "max-w-[85%]",
                    message.role === 'user' 
                      ? "bg-primary text-primary-foreground" 
                      : message.role === 'system'
                        ? "bg-muted text-muted-foreground text-sm"
                        : "bg-card border border-border"
                  )}
                >
                  {message.role === 'assistant' || message.role === 'system' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownContent content={message.content} />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  )}
                </div>
                
                {message.role === 'user' && (
                  <Avatar className="h-8 w-8 mt-1 flex-shrink-0">
                    <AvatarImage src={currentUser?.image || undefined} />
                    <AvatarFallback>
                      {currentUser?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            
            {isProcessing && (
              <div className="flex gap-3 max-w-full">
                <Avatar className="h-8 w-8 mt-1 flex-shrink-0 bg-white">
                  <AvatarImage src="/collab.png" alt="AI Assistant" />
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
                <div className="rounded-lg px-3 py-2 bg-card border border-border">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        
        {/* Input area */}
        <div className={cn("border-t border-border", isAssistantFullScreen ? "max-w-4xl mx-auto w-full" : "")}>
          <div className="p-4">
            <div className="relative">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask me to help with tasks..."
                className="min-h-[60px] resize-none pr-10"
                disabled={isProcessing}
                rows={3}
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2 bottom-2 h-6 w-6"
                onClick={handleSendMessage}
                disabled={!input.trim() || isProcessing}
              >
                <SendIcon className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AssistantWrapper; 