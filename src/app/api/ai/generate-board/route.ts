import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import axios from "axios";

async function generateBoardWithAI(description: string, projectType?: string, teamSize?: string) {
  const apiKey = process.env.OPENAPI_KEY;
  
  if (!apiKey) {
    console.error('OpenAI API key is missing');
    return null;
  }
  
  const endpoint = 'https://api.openai.com/v1/chat/completions';

  // Create a sophisticated prompt for ChatGPT
  const prompt = `You are a project management expert. Based on the following project description, generate a comprehensive board structure with milestones, epics, stories, and tasks.

PROJECT DESCRIPTION: "${description}"
PROJECT TYPE: ${projectType || "General"}
TEAM SIZE: ${teamSize || "Small (5-10 people)"}

Generate a JSON structure following this exact format:

{
  "board": {
    "name": "Project Name",
    "description": "Brief project description",
    "issuePrefix": "ABBR"
  },
  "columns": [
    {"name": "Milestones", "order": 0, "color": "#8B5CF6"},
    {"name": "Epics", "order": 1, "color": "#3B82F6"},
    {"name": "Stories", "order": 2, "color": "#10B981"},
    {"name": "Backlog", "order": 3, "color": "#64748B"},
    {"name": "To Do", "order": 4, "color": "#6366F1"},
    {"name": "In Progress", "order": 5, "color": "#EC4899"},
    {"name": "Review", "order": 6, "color": "#F59E0B"},
    {"name": "Done", "order": 7, "color": "#059669"}
  ],
  "milestones": [
    {
      "title": "Milestone Title",
      "description": "Milestone description",
      "status": "planned",
      "startDate": "2024-01-01",
      "dueDate": "2024-03-31",
      "color": "#8B5CF6",
      "columnName": "Milestones",
      "position": 0,
      "labels": ["milestone"],
      "epics": [
        {
          "title": "Epic Title",
          "description": "Epic description",
          "status": "backlog",
          "priority": "high",
          "color": "#3B82F6",
          "columnName": "Epics",
          "position": 0,
          "labels": ["epic"],
          "stories": [
            {
              "title": "Story Title",
              "description": "Story description",
              "status": "backlog",
              "priority": "medium",
              "type": "user-story",
              "storyPoints": 5,
              "color": "#10B981",
              "columnName": "Stories",
              "position": 0,
              "labels": ["story"],
              "tasks": [
                {
                  "title": "Task Title",
                  "description": "Task description",
                  "status": "todo",
                  "priority": "medium",
                  "type": "task",
                  "storyPoints": 2,
                  "columnName": "To Do",
                  "position": 0,
                  "labels": ["task"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Follow the enhanced guidelines below:

GUIDELINES:
1. Create as many **meaningful milestones** as necessary to fully cover all project phases and delivery checkpoints.  
   Do **not** restrict to a fixed number like "3–5" — include every milestone needed to complete the project.
2. For each milestone, generate all required **epics** to cover major features or deliverables.
3. For each epic, generate at least **3 or more well-scoped stories** (unless scope is trivial) that clearly represent independently deliverable units of work.
4. For each story, generate **all necessary tasks** that must be completed to fully implement it.  
   Tasks should be **actionable**, clearly defined, and specific.
5. Use **realistic timelines** starting from today's date, reflecting the complexity and sequence of work.
6. Assign **story points on a 1–13 scale** using Fibonacci-style estimation. Base this on effort and technical complexity.
7. Add **meaningful labels** for filtering and categorisation (e.g. frontend, backend, infra, API, UX).
8. Assign appropriate **priority levels** ("low", "medium", "high", "critical") based on business importance and urgency.
9. Generate a 2–4 letter **issuePrefix** based on the project name (e.g., "UPG" for *Unified Payment Gateway*).
10. Ensure all **titles and descriptions** are clear, professional, and actionable — no placeholders, no vague content.
11. Consider both **project type and team size** when defining scope, parallelism, and complexity.
12. Place each item into its correct column:
   - Milestones → "Milestones" column  
   - Epics → "Epics" column  
   - Stories → "Stories" column  
   - Tasks → "To Do" column
13. Tasks must represent **executable work items** ready for implementation.
14. The structure must be **comprehensive**, covering all phases such as planning, implementation, QA, deployment, and post-launch support.
15. Do **not** limit the number of items.  
    Generate **as many as necessary** to fully implement the project from start to finish.

IMPORTANT: Return ONLY valid JSON, no additional text or explanations.`;

  const messages = [
    {
      role: 'system',
      content: 'You are a project management expert specializing in agile methodologies and board structures. Always respond with valid JSON only.'
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    const response = await axios.post(
      endpoint,
      {
        model: 'gpt-4',
        messages: messages,
        max_tokens: 6000,
        temperature: 0.4,
        stream: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        responseType: 'stream',
      }
    );

    return response.data;

  } catch (error: any) {
    console.error('Error generating board with AI:', error.response?.data || error.message);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { description, projectType, teamSize }: { 
      description: string; 
      projectType?: string;
      teamSize?: string;
    } = await request.json();

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Project description must be at least 10 characters long" },
        { status: 400 }
      );
    }

    const stream = await generateBoardWithAI(description, projectType, teamSize);

    if (!stream) {
      return NextResponse.json(
        { error: "Failed to generate board structure with AI. Please try again." },
        { status: 500 }
      );
    }

    // Handle the streaming response properly
    const encoder = new TextEncoder();
    let accumulatedData = '';
    let buffer = '';
    let isControllerClosed = false;

    const closeController = (controller: ReadableStreamDefaultController) => {
      if (!isControllerClosed) {
        isControllerClosed = true;
        controller.close();
      }
    };

    const sendData = (controller: ReadableStreamDefaultController, data: any) => {
      if (!isControllerClosed) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          console.error('Error sending data:', error);
        }
      }
    };

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Set up event handlers for the axios stream
          stream.on('data', (chunk: Buffer) => {
            if (isControllerClosed) return;
            
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            // Process each line
            for (const line of lines) {
              if (line.trim().startsWith('data: ')) {
                const data = line.trim().slice(6);
                
                if (data === '[DONE]') {
                  // Stream ended, try to parse final result
                  if (accumulatedData.trim()) {
                    try {
                      const generatedBoard = JSON.parse(accumulatedData);
                      
                      // Basic validation
                      if (generatedBoard.board?.name && generatedBoard.milestones?.length) {
                        sendData(controller, {
                          success: true,
                          boardData: generatedBoard,
                          message: "Board structure generated successfully"
                        });
                      } else {
                        sendData(controller, {
                          error: "AI generated incomplete board structure"
                        });
                      }
                    } catch (parseError) {
                      console.error("Failed to parse accumulated JSON:", accumulatedData);
                      sendData(controller, {
                        error: "AI generated invalid JSON format"
                      });
                    }
                  }
                  closeController(controller);
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    const content = parsed.choices[0].delta.content;
                    accumulatedData += content;
                    
                    // Send progress update
                    sendData(controller, {
                      type: 'progress',
                      content: content,
                      accumulated: accumulatedData.length
                    });
                  }
                } catch (e) {
                  // Skip invalid JSON chunks
                }
              }
            }
          });

          stream.on('end', () => {
            if (isControllerClosed) return;
            
            // Final processing if no [DONE] received
            if (accumulatedData.trim()) {
              try {
                const generatedBoard = JSON.parse(accumulatedData);
                
                if (generatedBoard.board?.name && generatedBoard.milestones?.length) {
                  sendData(controller, {
                    success: true,
                    boardData: generatedBoard,
                    message: "Board structure generated successfully"
                  });
                } else {
                  sendData(controller, {
                    error: "AI generated incomplete board structure"
                  });
                }
              } catch (parseError) {
                console.error("Failed to parse final JSON:", accumulatedData);
                sendData(controller, {
                  error: "AI generated invalid JSON format"
                });
              }
            }
            closeController(controller);
          });

          stream.on('error', (error: any) => {
            if (isControllerClosed) return;
            
            console.error('Stream error:', error);
            sendData(controller, {
              error: "Stream processing error occurred"
            });
            closeController(controller);
          });
        } catch (error) {
          if (isControllerClosed) return;
          
          console.error('Stream processing error:', error);
          sendData(controller, {
            error: "Stream processing error occurred"
          });
          closeController(controller);
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Generate board error:", error);
    return NextResponse.json(
      { 
        error: "Failed to generate board structure",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 