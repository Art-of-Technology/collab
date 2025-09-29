import axios from "axios"
import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";



async function improveEnglishText(userInput: string) {
    const apiKey = process.env.OPENAPI_KEY;
    if (!apiKey) {
        console.error('OpenAI API key is missing - check OPENAPI_KEY environment variable');
        return null;
    }
    
    const endpoint = 'https://api.openai.com/v1/chat/completions';

    const messages = [
        {
            role: 'system',
            content: `You are a helpful assistant that improves the clarity, grammar, and natural flow of English text while preserving its original meaning and formatting.

Key instructions:
- If the input contains markdown formatting (headers, bold, italic, lists, etc.), preserve and enhance the formatting in your response
- Maintain the document structure (headings, paragraphs, lists, links, etc.)
- Improve readability while keeping the same tone and intent
- Fix grammar, spelling, and awkward phrasing
- Make the text more concise and professional when appropriate
- Respond with properly formatted markdown when the input has markdown
- If the input is plain text, respond with plain text unless formatting would improve clarity

Always maintain the original meaning and key information.`,
        },
        {
            role: 'user',
            content: `Please improve the following content:\n\n${userInput}`,
        },
    ];

    try {
        const response = await axios.post(
            endpoint,
            {
                model: 'gpt-4-turbo',
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
            console.error('improveEnglishText: Unexpected API response format:', response.data);
            return null;
        }
        
        const improvedText = response.data.choices[0].message.content.trim();
        return improvedText;
    } catch (error: any) {
        console.error('improveEnglishText: Error calling OpenAI API:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
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

        const normalizedResult = normalizeText(result);

        return NextResponse.json({
            message: normalizedResult
        });
    } catch (error) {
        console.error('Error in improve API:', error);
        return NextResponse.json(
            { error: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
