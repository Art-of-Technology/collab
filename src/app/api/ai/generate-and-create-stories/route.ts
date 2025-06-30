import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { jobStorage, JobStatus } from '@/lib/job-storage';
import { prisma } from '@/lib/prisma';
import { AI_PROMPTS, AI_TOKEN_LIMITS, AI_CONFIG } from '@/lib/ai-prompts';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { epicId, boardId, workspaceId } = await request.json();

    if (!epicId || !boardId || !workspaceId) {
      return NextResponse.json(
        { error: 'Epic ID, Board ID, and Workspace ID are required' },
        { status: 400 }
      );
    }

    // Validate access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 });
    }

    // Get epic details
    const epic = await prisma.epic.findFirst({
      where: {
        id: epicId,
        workspaceId: workspaceId
      },
      include: {
        milestone: true
      }
    });

    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    // Create background job
    const jobId = `story_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: JobStatus = {
      id: jobId,
      userId: session.user.id,
      workspaceId,
      description: `Generating and creating stories for epic: ${epic.title}`,
      status: 'PENDING',
      progress: 0,
      currentStep: 'Initializing AI story generation...',
      boardData: { 
        epicId, 
        boardId, 
        epicTitle: epic.title,
        epicDescription: epic.description,
        milestoneTitle: epic.milestone?.title
      },
      boardId: boardId,
      error: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await jobStorage.set(job);

    console.log(`AI story generation job created with ID: ${jobId}`);

    // Start background process
    startBackgroundAIStoryGeneration(jobId);

    return NextResponse.json({ 
      success: true, 
      jobId: jobId,
      message: 'AI story generation started'
    });

  } catch (error) {
    console.error('Error starting AI story generation:', error);
    return NextResponse.json(
      { error: 'Failed to start AI story generation' },
      { status: 500 }
    );
  }
}

// Helper function to update job status
async function updateJobStatus(jobId: string, status: JobStatus['status'], progress: number, currentStep: string) {
  try {
    const job = await jobStorage.get(jobId);
    if (job) {
      job.status = status;
      job.progress = progress;
      job.currentStep = currentStep;
      job.updatedAt = new Date();
      await jobStorage.set(job);
    }
  } catch (error) {
    console.error(`Error updating job status for ${jobId}:`, error);
  }
}

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

// Background AI story generation and creation function
async function startBackgroundAIStoryGeneration(jobId: string) {
  setTimeout(async () => {
    try {
      console.log(`Starting background AI story generation for job: ${jobId}`);
      const job = await jobStorage.get(jobId);
      if (!job || !job.boardData) {
        console.log(`Job not found or missing boardData: ${jobId}`);
        return;
      }

      const { epicId, boardId, epicTitle, epicDescription, milestoneTitle } = job.boardData;

      // Step 1: Generate stories with AI
      await updateJobStatus(jobId, 'GENERATING_STORIES', 10, 'Generating stories with AI...');

      const prompt = `${AI_PROMPTS.STORIES_FROM_EPIC}

Epic Context:
- Title: ${epicTitle}
- Description: ${epicDescription || 'No description provided'}
${milestoneTitle ? `- Milestone: ${milestoneTitle}` : ''}

Please generate stories for this epic. Focus on breaking down the epic into actionable user stories that deliver value incrementally.`;

      console.log('Sending AI request for story generation...');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAPI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that generates user stories based on epics. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 3000,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API request failed: ${response.statusText}`);
      }

      await updateJobStatus(jobId, 'GENERATING_STORIES', 30, 'Processing AI response...');

      const aiResponse = await response.json();
      const content = aiResponse.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content received from AI');
      }

      // Parse AI response
      let generatedStories;
      try {
        // Clean up the response to extract JSON
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error('No JSON array found in AI response');
        }
        generatedStories = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        throw new Error('Failed to parse AI response');
      }

      if (!Array.isArray(generatedStories) || generatedStories.length === 0) {
        throw new Error('AI did not generate any valid stories');
      }

      await updateJobStatus(jobId, 'GENERATING_STORIES', 50, `Generated ${generatedStories.length} stories, now creating them...`);

      // Step 2: Validate epic and board
      const epic = await prisma.epic.findFirst({
        where: {
          id: epicId,
          workspaceId: job.workspaceId
        }
      });

      if (!epic) {
        throw new Error('Epic not found');
      }

      const taskBoard = await prisma.taskBoard.findFirst({
        where: {
          id: boardId,
          workspaceId: job.workspaceId
        },
        include: {
          columns: true
        }
      });

      if (!taskBoard) {
        throw new Error('Task board not found');
      }

      // Find the "Stories" or appropriate column
      const storiesColumn = taskBoard.columns.find(col => 
        col.name.toLowerCase() === 'stories' || 
        col.name.toLowerCase() === 'story' ||
        col.name.toLowerCase() === 'to do' ||
        col.name.toLowerCase() === 'todo' ||
        col.name.toLowerCase() === 'backlog'
      ) || taskBoard.columns[0];

      if (!storiesColumn) {
        throw new Error('No columns found in task board');
      }

      // Step 3: Create stories
      const createdStories = [];
      let position = 0;
      const totalStories = generatedStories.length;

      for (let i = 0; i < generatedStories.length; i++) {
        const storyData = generatedStories[i];
        const progress = 50 + Math.floor((i / totalStories) * 45);
        
        await updateJobStatus(jobId, 'GENERATING_STORIES', progress, `Creating story ${i + 1}/${totalStories}: ${storyData.title}`);

        try {
          // Parse description if it's HTML
          const description = storyData.description || "";

          // Generate issue key if board has a prefix
          let issueKey = null;
          if (taskBoard.issuePrefix) {
            // Update the board's next issue number
            const updatedBoard = await prisma.taskBoard.update({
              where: { id: taskBoard.id },
              data: { nextIssueNumber: { increment: 1 } }
            });
            issueKey = `${taskBoard.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
          }

          const story = await prisma.story.create({
            data: {
              title: storyData.title,
              description: description,
              priority: storyData.priority?.toUpperCase() || "MEDIUM",
              status: storiesColumn.name,
              storyPoints: storyData.storyPoints || undefined,
              position: position++,
              issueKey: issueKey,
              taskBoardId: boardId,
              columnId: storiesColumn.id,
              workspaceId: job.workspaceId,
              epicId: epicId,
              reporterId: job.userId,
              assigneeId: job.userId,
            },
            include: {
              assignee: true,
              reporter: true,
              column: true,
              epic: true,
            }
          });

          createdStories.push(story);

          // Small delay to prevent overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (storyError) {
          console.error(`Error creating story: ${storyData.title}`, storyError);
          // Continue with other stories even if one fails
        }
      }

      await updateJobStatus(jobId, 'COMPLETED', 100, `Successfully generated and created ${createdStories.length} stories!`);

      // Update job with created stories
      const updatedJob = await jobStorage.get(jobId);
      if (updatedJob) {
        updatedJob.boardData = { ...updatedJob.boardData, createdStories, generatedStories };
        await jobStorage.set(updatedJob);
      }

    } catch (error) {
      console.error('Background AI story generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateJobStatus(jobId, 'FAILED', 0, `Error: ${errorMessage}`);
    }
  }, 100);
} 