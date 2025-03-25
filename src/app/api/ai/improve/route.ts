import axios from "axios"
import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";



async function improveEnglishText(userInput: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
        console.error('OpenAI API key is missing');
        return null;
    }
    
    const endpoint = 'https://api.openai.com/v1/chat/completions';

    const messages = [
        {
            role: 'system',
            content: 'You are a helpful assistant that improves the clarity, grammar, and natural flow of English text without changing its meaning.',
        },
        {
            role: 'user',
            content: `Please improve the following text in English:\n"${userInput}"`,
        },
    ];

    try {
        const response = await axios.post(
            endpoint,
            {
                model: 'gpt-3.5-turbo',
                messages: messages,
                temperature: 0.7,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
            }
        );
        
        if (!response.data?.choices?.[0]?.message?.content) {
            console.error('Unexpected API response format:', response.data);
            return null;
        }
        
        const improvedText = response.data.choices[0].message.content.trim();
        return improvedText;
    } catch (error: any) {
        console.error('Error improving text:', error.response?.data || error.message);
        return null;
    }
}

function normalizeText(text: string | null): string {
    if (!text) {
        return "Failed to improve text. Please try again.";
    }
    
    if (text.startsWith('"')) {
        text = text.slice(1);
    }
    if (text.endsWith('"')) {
        text = text.slice(0, -1);
    }
    return text;
}


export async function POST(req: Request) {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
        
        const body = await req.json();
        const { text } = body;
        
        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: "Text input is required" },
                { status: 400 }
            );
        }
        
        const result = await improveEnglishText(text);
        
        if (!result) {
            return NextResponse.json(
                { error: "Failed to improve text. Please try again." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            message: normalizeText(result)
        });
    } catch (error) {
        console.error('Error in improve API:', error);
        return NextResponse.json(
            { error: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
