"use client";

import { useUiContext } from '@/context/UiContext'
import { useRef, useEffect, useState } from 'react'

declare global {
  interface Window {
    chatbox: any
    ChatWidget: {
      initChatWidget: (config: {
        apiKey: string
        userId: string
        userEmail: string
        theme: string
        token?: string
        targetElement: string
        defaultChannel?: string
      }) => void
      configUpdate: (config: any) => void
    }
  }
}

const ChatboxWrapper = () => {
  const { isLoggedIn, isChatOpen } = useUiContext()
  const initialized = useRef(false)
  const [userData, setUserData] = useState<any>(null)
  const [triggerUpdate, setTriggerUpdate] = useState(0)

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!isLoggedIn) return
      
      try {
        const response = await fetch('/api/user/me')
        if (response.ok) {
          const data = await response.json()
          setUserData(data.user)
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
      }
    }

    fetchUserData()
  }, [isLoggedIn])

  // Handle widget initialization
  useEffect(() => {
    const initChatWidget = async () => {
      if (initialized.current) return

      await window.ChatWidget.initChatWidget({
        apiKey: '2ca5bd89c3f4d9b08b8c82db135c8a592df9dd85477b275b3c15de10e46b3e06',
        userId: 'anonymous',
        userEmail: 'anonymous@example.com',
        theme: 'team-dark',
        targetElement: 'chat-widget-container',
        defaultChannel: 'cm7debezu0003ke0la2emlo1c'
      })

      console.log('Initializing widget')
      initialized.current = true
      // Trigger a re-render to ensure the update effect runs with the initialized state
      setTriggerUpdate((prev) => prev + 1)
    }

    if (window.ChatWidget) {
      initChatWidget()
    } else {
      const intervalId = setInterval(() => {
        if (window.ChatWidget) {
          console.log('ChatWidget became available')
          clearInterval(intervalId)
          initChatWidget()
        }
      }, 100)
      return () => clearInterval(intervalId)
    }
  }, []) // Keep this empty to only run once on mount

  // Update widget config when user data changes
  useEffect(() => {
    if (!initialized.current || !window.ChatWidget) {
      console.log('Widget not ready for update yet')
      return
    }

    const username = userData?.name || 'anonymous'
    
    window.ChatWidget.configUpdate({
      apiKey: '2ca5bd89c3f4d9b08b8c82db135c8a592df9dd85477b275b3c15de10e46b3e06',
      userId: username,
      theme: 'team-dark', // Always use team-dark theme as requested
      targetElement: 'chat-widget-container',
      defaultChannel: 'cm7debezu0003ke0la2emlo1c'
    })
  }, [userData, triggerUpdate])

  return (
    <aside 
      className={`fixed right-0 top-0 h-screen bg-card border-l border-border transition-all duration-150 ease-in-out overflow-hidden pt-16 
      ${isChatOpen ? 'w-[360px]' : 'w-0'} 
      md:w-[360px] md:translate-x-[100%] md:${isChatOpen ? 'translate-x-0' : ''}`}
    >
      <div className="w-full h-full" id="chat-widget-container" />
    </aside>
  )
}

export default ChatboxWrapper