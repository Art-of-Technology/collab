import { useState } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Link,
  List,
  ListOrdered,
  Code,
  Code2,
  Plus,
  Smile,
  AtSign,
  Video,
  Mic,
  Send,
  Type
} from "lucide-react";

export default function MessageInput() {
  const [message, setMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="bg-[#313338] p-1.5 rounded-md w-full max-w-xl border border-[#1e1f22]">
      <div className={`flex flex-wrap gap-3 px-2 py-1 border-b border-[#1e1f22] transition-opacity duration-200 ${isFocused ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <Bold className="w-4 h-4 text-white/70 cursor-pointer" />
        <Italic className="w-4 h-4 text-white/70 cursor-pointer" />
        <Strikethrough className="w-4 h-4 text-white/70 cursor-pointer" />
        <Link className="w-4 h-4 text-white/70 cursor-pointer" />
        <ListOrdered className="w-4 h-4 text-white/70 cursor-pointer" />
        <List className="w-4 h-4 text-white/70 cursor-pointer" />
        <Code className="w-4 h-4 text-white/70 cursor-pointer" />
        <Code2 className="w-4 h-4 text-white/70 cursor-pointer" />
      </div>
      <div className="flex items-center px-2 py-2">
        <input
          type="text"
          placeholder="Message Asim"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="flex-1 bg-transparent text-white placeholder-white/40 outline-none py-2"
        />
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${isFocused ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <Plus className="w-4 h-4 text-white/70 cursor-pointer" />
          <Type className="w-4 h-4 text-white/70 cursor-pointer" />
          <Smile className="w-4 h-4 text-white/70 cursor-pointer" />
          <AtSign className="w-4 h-4 text-white/70 cursor-pointer" />
          <Video className="w-4 h-4 text-white/70 cursor-pointer" />
          <Mic className="w-4 h-4 text-white/70 cursor-pointer" />
          <Send className="w-4 h-4 text-white/70 cursor-pointer" />
        </div>
      </div>
    </div>
  );
}