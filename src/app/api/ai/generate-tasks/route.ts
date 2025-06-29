import { NextRequest, NextResponse } from "next/server";
import { AI_PROMPTS, AI_TOKEN_LIMITS, AI_CONFIG } from "@/lib/ai-prompts";

// Enhanced AI generation with streaming and completion handling
async function generateWithAI(
  systemPrompt: string, 
  userMessages: Array<{role: string, content: string}>, 
  maxTokens: number = 4000,
  maxRetries: number = AI_CONFIG.MAX_RETRIES
): Promise<string> {
  let attempt = 0;
  let fullContent = '';
  let conversation = [...userMessages];

  while (attempt < maxRetries) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAPI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_CONFIG.MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversation
          ],
          temperature: AI_CONFIG.TEMPERATURE,
          max_tokens: maxTokens,
        }),
      });

      const data = await response.json();
      
      if (!data.choices || !data.choices[0]) {
        throw new Error('Invalid API response structure');
      }

      const choice = data.choices[0];
      const content = choice.message?.content || '';
      const finishReason = choice.finish_reason;

      // Accumulate content
      if (attempt === 0) {
        fullContent = content;
      } else {
        // For continuation requests, append content
        fullContent += content;
      }

      // If response was completed successfully, return
      if (finishReason === 'stop') {
        return fullContent;
      }

      // If response was truncated due to length, continue the conversation
      if (finishReason === 'length') {
        console.log(`Response truncated at attempt ${attempt + 1}, continuing...`);
        
        // Add the truncated response to conversation and ask for continuation
        conversation.push({ role: 'assistant', content });
        conversation.push({ 
          role: 'user', 
          content: 'Please continue from where you left off. Complete the remaining content.'
        });
        
        attempt++;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      // For any other finish reason, return what we have
      return fullContent;

    } catch (error) {
      attempt++;
      console.error(`AI generation attempt ${attempt} failed:`, error);
      
      if (attempt >= maxRetries) {
        throw new Error(`AI generation failed after ${maxRetries} attempts: ${error}`);
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }

  throw new Error('AI generation failed: Maximum retries exceeded');
}

// Enhanced JSON parsing with multiple fix strategies
async function parseAIResponse<T>(
  content: string, 
  expectedStructure: string,
  retryPrompt?: string
): Promise<T> {
  let cleanedContent = content.trim();
  
  // Remove markdown code blocks if present
  cleanedContent = cleanedContent.replace(/^```(?:json)?\n?/gm, '').replace(/\n?```$/gm, '');
  
  // Try parsing multiple potential JSON blocks (for continuation scenarios)
  const jsonBlocks: string[] = [];
  
  // Look for array patterns first
  const arrayMatches = cleanedContent.match(/\[\s*\{[\s\S]*\}\s*\]/g);
  if (arrayMatches) {
    jsonBlocks.push(...arrayMatches);
  }
  
  // Look for object patterns
  const objectMatches = cleanedContent.match(/\{\s*[\s\S]*\}/g);
  if (objectMatches && !arrayMatches) {
    jsonBlocks.push(...objectMatches);
  }
  
  // If no structured JSON found, try the whole content
  if (jsonBlocks.length === 0) {
    jsonBlocks.push(cleanedContent);
  }

  for (let i = 0; i < jsonBlocks.length; i++) {
    let jsonStr = jsonBlocks[i].trim();
    
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`Successfully parsed JSON on block ${i + 1}:`, typeof parsed);
      return parsed;
    } catch (error) {
      console.log(`JSON parse attempt ${i + 1} failed, trying fixes...`);
      
      // Try various fixes for common JSON issues
      const fixes = [
        // Add missing closing brackets
        () => {
          const openBraces = (jsonStr.match(/\{/g) || []).length;
          const closeBraces = (jsonStr.match(/\}/g) || []).length;
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;
          
          let fixed = jsonStr;
          for (let j = 0; j < openBraces - closeBraces; j++) {
            fixed += '}';
          }
          for (let j = 0; j < openBrackets - closeBrackets; j++) {
            fixed += ']';
          }
          return fixed;
        },
        
        // Fix trailing commas
        () => jsonStr.replace(/,(\s*[}\]])/g, '$1'),
        
        // Fix missing commas between objects
        () => jsonStr.replace(/}(\s*{)/g, '},$1'),
        
        // Fix unescaped quotes in strings
        () => jsonStr.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"'),
      ];

      for (const fix of fixes) {
        try {
          const fixedJson = fix();
          const parsed = JSON.parse(fixedJson);
          console.log(`JSON successfully fixed and parsed`);
          return parsed;
        } catch (fixError) {
          // Continue to next fix
        }
      }
    }
  }

  // If all parsing attempts failed, log detailed error
  console.error('All JSON parsing attempts failed for:', expectedStructure);
  console.error('Content preview:', cleanedContent.substring(0, 500));
  throw new Error(`Failed to parse ${expectedStructure} response as JSON`);
}

export async function POST(request: NextRequest) {
  try {
    const { storyContext, userEmail } = await request.json();

    if (!storyContext) {
      return NextResponse.json(
        { error: "Story context is required" },
        { status: 400 }
      );
    }

    // Create the full prompt for task generation
    const systemPrompt = AI_PROMPTS.TASKS(userEmail || "user@example.com");
    const userMessages = [
      { role: 'user', content: storyContext }
    ];

    // Generate tasks using AI
    const aiResponse = await generateWithAI(
      systemPrompt,
      userMessages,
      AI_TOKEN_LIMITS.TASKS,
      AI_CONFIG.MAX_RETRIES
    );

    // Parse the AI response
    const parsedData = await parseAIResponse(aiResponse, "TASKS generation");

    if (!parsedData || !Array.isArray(parsedData)) {
      console.error("Invalid AI response format:", aiResponse);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tasks: parsedData,
      success: true,
    });

  } catch (error) {
    console.error("Error generating tasks:", error);
    return NextResponse.json(
      { error: "Failed to generate tasks" },
      { status: 500 }
    );
  }
} 