"use client";

import { useUiContext } from '@/context/UiContext'
import { useEffect, useState } from 'react'

const ChatboxWrapper = () => {
  const { isLoggedIn, isChatOpen } = useUiContext()
  const [userData, setUserData] = useState<any>(null)
  const [chatToken, setChatToken] = useState<string | null>(null)

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!isLoggedIn) {
        setUserData(null) // Clear user data if not logged in
        setChatToken(null) // Clear chat token if not logged in
        return
      }

      try {
        const response = await fetch('/api/user/me')
        if (response.ok) {
          const data = await response.json()
          setUserData(data.user)
        } else {
          setUserData(null)
          setChatToken(null) // Clear token if user data fetch fails
          console.error('Error fetching user data:', await response.text())
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
        setUserData(null)
        setChatToken(null) // Clear token on error
      }
    }

    fetchUserData()
  }, [isLoggedIn])

  // Fetch chat token when user data is available
  useEffect(() => {
    const fetchChatToken = async () => {
      if (!isLoggedIn || !userData) {
        setChatToken(null) // Ensure token is cleared if no user or not logged in
        return
      }

      // Assuming userData.id is the unique identifier for externalUserId.
      // Adjust userData.id, userData.name, userData.email if your structure is different.
      if (!userData.id || !userData.name || !userData.email) {
        console.warn('User data is incomplete for chat token generation.', userData)
        setChatToken(null)
        return;
      }

      try {
        const response = await fetch('/api/chat-token', { // YOU WILL NEED TO CREATE THIS BACKEND ENDPOINT
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            externalUserId: userData.id,
            name: userData.name,
            email: userData.email,
            // avatar: userData.avatarUrl // Optional: if you have user avatars
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setChatToken(data.token)
        } else {
          console.error('Error fetching chat token:', await response.text())
          setChatToken(null)
        }
      } catch (error) {
        console.error('Error fetching chat token:', error)
        setChatToken(null)
      }
    }

    fetchChatToken()
  }, [isLoggedIn, userData])

  return (
    <aside
      className={`fixed right-0 top-16 bottom-0 z-50 bg-[#1c1c1c] border-l border-[#2a2929] transition-all duration-150 ease-in-out overflow-hidden shadow-lg
      ${isChatOpen ? 'w-[360px]' : 'w-0'} 
      `}
    >
      {/* Keep the iframe mounted but control its visibility based on state */}
      {isLoggedIn && chatToken ? (
        <div
          className="w-full h-full"
        >
          <iframe
            src={`https://api.chatproject.io/widget?token=${chatToken}`}
            width="100%"
            height="100%"
            style={{ border: 'none' }}
            title="Chat Widget"
          ></iframe>
        </div>
      ) : isChatOpen && isLoggedIn && !chatToken && userData ? (
        <div className="flex items-center justify-center h-full text-white p-4">
          Loading chat...
        </div>
      ) : isChatOpen && !isLoggedIn ? (
        <div className="flex items-center justify-center h-full text-white p-4">
          Please log in to use the chat.
        </div>
      ) : null}
    </aside>
  )
}

export default ChatboxWrapper