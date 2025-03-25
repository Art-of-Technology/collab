const axios = require('axios');
import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";



async function improveEnglishText(userInput: string) {
    const apiKey = process.env.OPENAPI_KEY;
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
        console.log(response.data.choices[0].message.content)
        const improvedText = response.data.choices[0].message.content.trim();
        return improvedText;
    } catch (error: any) {
        console.error('Error improving text:', error.response?.data || error.message);
        return null;
    }
}

function normalizeText(text: string): string {
    if (text.startsWith('"')) {
        text = text.slice(1);
    }
    if (text.endsWith('"')) {
        text = text.slice(0, -1);
    }
    return text;
}


export async function POST(req: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }
    const body = await req.json();
    const { text } = body;
    const result = await improveEnglishText(text);

    return NextResponse.json({
        message: normalizeText(result)
    });

}
