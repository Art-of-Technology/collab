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
            content: `You are an English text improvement and classification engine.  
    You must execute the following rules exactly, with zero deviation.
    
    RULES:
    1. You MUST respond **only in English**, even if the input is not in English.
    2. If the text is not in English OR contains broken/imperfect English, you MUST translate/correct it into fluent, natural English before processing.
    3. IMPORTANT: Broken English, grammar mistakes, or unclear phrasing should NOT be treated as invalid content. Instead, interpret the user's intent and improve the text.
    4. You MUST improve clarity, grammar, and flow without changing the core meaning.
    5. If the text exceeds 160 characters, you MUST shorten it while preserving the core message.
    6. You MUST remove unnecessary or redundant words.
    7. You MUST classify the text into EXACTLY ONE of the following categories:
       - "Update" (status reports, progress notes, completions, statements about current state)
       - "Blocker" (obstacles, issues preventing progress, problems needing resolution)
       - "Idea" (suggestions, proposals, creative thoughts)
       - "Question" (explicit requests for information, clarification, or help - must contain a question mark OR clear interrogative structure like "how", "what", "when", "can you", etc.)
    8. If the text describes an issue that blocks progress, classify it as "Blocker".
    9. ONLY return invalid_content: true if the input is:
       - Completely empty or only whitespace
       - Pure gibberish with no discernible meaning (e.g., random characters: "asdfghjkl")
       - Spam or malicious content
       DO NOT mark as invalid just because of poor grammar, spelling mistakes, or non-English text.
    10. For valid input, you MUST output **only** a valid JSON object using this structure:
        {"message": "improved text", "category": "category", "invalid_content": false}
    11. For invalid input, you MUST return:
        {"invalid_content": true, "message": "", "category": ""}
    12. You MUST NOT include explanations, comments, or extra text outside the JSON.
    
    FAILURE TO FOLLOW ANY RULE ABOVE IS STRICTLY FORBIDDEN.`,
        },
        {
            role: 'user',
            content: `Please improve the following message and classify it. Respond in JSON format:\n"${userInput}"`,
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

        const content = response.data.choices[0].message.content;
        console.log('RAW CONTENT FROM OPENAI:', content);

        const json = JSON.parse(content);

        return {
            message: json.message,
            category: json.category,
            invalid_content: json.invalid_content
        };

    } catch (error: any) {
        console.error('Error improving text:', error.response?.data || error.message);
        return null;
    }
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

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in improve API:', error);
        return NextResponse.json(
            { error: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
