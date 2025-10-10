import axios from "axios"
import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";



async function improveEnglishText(userInput: string) {
    const apiKey = process.env.OPENAPI_KEY;
    
    if (!apiKey) {
        console.error('OpenAI API key is missing');
        return null;
    }
    
    const endpoint = 'https://api.openai.com/v1/chat/completions';

    const messages = [
        {
            role: 'system',
            content: `You are an English text improvement and classification engine.  
You must execute the following rules exactly, with zero deviation.

RULES:
1. You MUST respond **only in English**, even if the input is not in English.
2. If the text is not in English, you MUST translate it into fluent, natural English before processing.
3. You MUST improve clarity, grammar, and flow without changing meaning.
4. If the text exceeds 160 characters, you MUST shorten it while preserving the core message.
5. You MUST remove unnecessary or redundant words.
6. You MUST classify the text into EXACTLY ONE of the following categories:
   - "Update"
   - "Blocker"
   - "Idea"
   - "Question"
7. If the text describes an issue that blocks progress, classify it as "Blocker".
8. You MUST output **only** a valid JSON object using this structure:
   {"message": "improved text", "category": "category"}
9. You MUST NOT include explanations, comments, or extra text outside the JSON.

FAILURE TO FOLLOW ANY RULE ABOVE IS STRICTLY FORBIDDEN.`,
        },
        {
            role: 'user',
            content: `Please improve the following message and classify it. Respond in JSON format like { "message": "", "category": "" }:\n"${userInput}"`,
        },
    ];
    

    try {
        const response = await axios.post(
            endpoint,
            {
                model: 'gpt-4-turbo',
                messages: messages,
                temperature: 0.3,
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

        const json = JSON.parse(response.data.choices[0].message.content)
        return json;
    } catch (error: any) {
        console.error('Error improving text:', error.response?.data || error.message);
        return null;
    }
}

// function normalizeText(text: string | null): string {
//     if (!text) {
//         return "Failed to improve text. Please try again.";
//     }
    
//     if (text.startsWith('"')) {
//         text = text.slice(1);
//     }
//     if (text.endsWith('"')) {
//         text = text.slice(0, -1);
//     }
//     return text;
// }


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

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in improve API:', error);
        return NextResponse.json(
            { error: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
